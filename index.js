import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import logger from 'koa-logger';
import latex from 'node-latex';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import lescape from 'escape-latex';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

import mainTex from "./tex/main.tex" with { type: "text" };
import macroTex from "./tex/macro.tex" with { type: "text" };
import indexHTML from "./index.html" with { type: "text" };
import stylesCSS from "./styles.css" with { type: "text" };

import packageJson from "./package.json" with { type: "json" };
import { signPng } from './signPng';

const VERSION = packageJson.version;

// Constants
const DEFAULT_PORT = process.env.PORT || 3000;
const MAX_CONCURRENT_COMPILATIONS = parseInt(process.env.MAX_CONCURRENT_COMPILATIONS) || 5;
const COMPILATION_TIMEOUT_MS = parseInt(process.env.COMPILATION_TIMEOUT_MS) || 30000;
const MAX_MEDICINES = 20;
const MAX_IMAGE_SIZE_KB = 1024;

// LaTeX Compilation Pool
class LatexCompilationPool {
    constructor(maxConcurrent = MAX_CONCURRENT_COMPILATIONS) {
        this.maxConcurrent = maxConcurrent;
        this.activeCompilations = 0;
        this.queue = [];
        this.emitter = new EventEmitter();
    }

    async acquire() {
        return new Promise((resolve) => {
            const tryAcquire = () => {
                if (this.activeCompilations < this.maxConcurrent) {
                    this.activeCompilations++;
                    console.log(`[LatexPool] Acquired compilation slot, active: ${this.activeCompilations}/${this.maxConcurrent}`);
                    resolve({
                        release: () => {
                            this.activeCompilations--;
                            console.log(`[LatexPool] Released compilation slot, active: ${this.activeCompilations}/${this.maxConcurrent}`);
                            if (this.queue.length > 0) {
                                const next = this.queue.shift();
                                setTimeout(() => next(), 0);
                            }
                        }
                    });
                } else {
                    console.log(`[LatexPool] Compilation slots full, queued request, queue length: ${this.queue.length + 1}`);
                    this.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    getStats() {
        return {
            active: this.activeCompilations,
            max: this.maxConcurrent,
            queued: this.queue.length
        };
    }
}

// Create global compilation pool instance
const latexPool = new LatexCompilationPool(MAX_CONCURRENT_COMPILATIONS);

const app = new koa();

// Security headers middleware
app.use(async (ctx, next) => {
    // Set security headers
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('X-Frame-Options', 'DENY');
    ctx.set('X-XSS-Protection', '1; mode=block');
    ctx.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Add CSP for HTML pages
    if (ctx.type === 'text/html' || ctx.path === '/') {
        ctx.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
    }
    
    await next();
});

app.use(logger());
app.use(bodyParser({
    jsonLimit: '5mb'
}));

// Utility functions
function getTargetAuthCode() {
    const rawInfo = `${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`;
    const hash = crypto.createHash('sha256').update(rawInfo).digest('hex').toUpperCase();
    return hash.slice(0, 12);
}

function showLegalWarning() {
    const width = 60;
    const line = "═".repeat(width);
    const title = `PRESCRIPTION GENERATOR v${VERSION} `;

    console.log(`\x1b[33m╔${line}╗\x1b[0m`);
    console.log(`\x1b[33m║\x1b[41m\x1b[37m${title.padStart((width + title.length) / 2).padEnd(width)}\x1b[0m\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m╠${line}╣\x1b[0m`);

    const content = [
        "           【 Legal Notice and Open Source License 】           ",
        "",
        `   This program is licensed under GNU AGPLv3.             `,
        "   Any derivative services based on this project must disclose source code to users.   ",
        "",
        "  [ WARNING ] Non-practicing physicians are prohibited from using this tool for illegal medical practice.   ",
        "  The software author is not liable for any legal consequences arising from user violations.",
        "",
        `  Source Code: ${packageJson.repository?.url || "Error fetching URL"}`
    ];

    content.forEach(text => {
        const textWidth = text.replace(/[^\x00-\xff]/g, "  ").length;
        const padding = Math.max(0, width - textWidth);
        const leftPad = Math.floor(padding / 2);
        console.log(`\x1b[33m║\x1b[0m${" ".repeat(leftPad)}${text}${" ".repeat(padding - leftPad)}\x1b[33m║\x1b[0m`);
    });

    console.log(`\x1b[33m╚${line}╝\x1b[0m\n`);
}

// Input validation utilities
class InputValidator {
    static validateInput(value, fieldName, maxLength = 100) {
        if (value === undefined || value === null) return '';
        const str = String(value);
        if (str.length > maxLength) {
            throw new Error(`Field ${fieldName} exceeds maximum length of ${maxLength}`);
        }
        return str;
    }

    static validateDate(dateStr) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            throw new Error('Invalid date format, expected YYYY-MM-DD');
        }
        const [year, month, day] = dateStr.split('-').map(Number);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            throw new Error('Invalid date values');
        }
        return dateStr;
    }

    static validateMedicines(medicines) {
        if (!Array.isArray(medicines)) {
            throw new Error('Medicines must be an array');
        }
        if (medicines.length === 0) {
            throw new Error('At least one medicine is required');
        }
        if (medicines.length > MAX_MEDICINES) {
            throw new Error(`Cannot exceed ${MAX_MEDICINES} medicines`);
        }
        
        return medicines.map((med, index) => {
            if (!med || typeof med !== 'object') {
                throw new Error(`Medicine ${index + 1} has invalid format`);
            }
            return {
                name: InputValidator.validateInput(med.name, `Medicine ${index + 1} name`, 50),
                spec: InputValidator.validateInput(med.spec || '', `Medicine ${index + 1} specification`, 30),
                quantity: InputValidator.validateInput(med.quantity, `Medicine ${index + 1} quantity`, 20),
                usage: InputValidator.validateInput(med.usage, `Medicine ${index + 1} usage`, 100)
            };
        });
    }

    static validateBase64Image(base64Str, maxSizeKB = MAX_IMAGE_SIZE_KB) {
        if (!base64Str) return null;
        
        // Validate base64 format
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Str)) {
            throw new Error('Invalid image format');
        }
        
        // Calculate size (base64 string length * 3/4)
        const sizeBytes = Math.floor(base64Str.length * 3 / 4);
        if (sizeBytes > maxSizeKB * 1024) {
            throw new Error(`Image size exceeds ${maxSizeKB}KB limit`);
        }
        
        // Validate PNG format (base64 starts with iVBORw0KGgo)
        if (!base64Str.startsWith('iVBORw0KGgo')) {
            throw new Error('Only PNG format images are supported');
        }
        
        return base64Str;
    }
}

// Show legal warning and initialization info
showLegalWarning();

const authBase = `${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`;
console.log(`[License] Authorization base: ${authBase}`);
console.log(`[License] See getTargetAuthCode function in source code for authorization code calculation method`);

const PORT = process.env.PORT || DEFAULT_PORT;
console.log(`[Hint] Server port can be customized via PORT environment variable, current port: ${PORT}`);

const EXPECTED_CODE = getTargetAuthCode();

// Route handlers
app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/source') {
        ctx.status = 200;
        ctx.body = `This program is open source under AGPL-3.0 license. Please visit the following address for complete source code:\n${packageJson.repository.url}`;
    } else {
        await next();
    }
});

// Static file serving middleware
app.use(async (ctx, next) => {
    // Serve CSS file
    if (ctx.method === 'GET' && ctx.path === '/styles.css') {
        ctx.status = 200;
        ctx.type = 'text/css';
        ctx.body = stylesCSS;
        return;
    }
    
    // Serve HTML file
    if (ctx.method === 'GET' && ctx.path === '/') {
        ctx.status = 200;
        ctx.type = 'text/html';
        ctx.body = indexHTML.replace('{{VERSION}}', VERSION).replace('{{AUTH_BASE}}', authBase);
        return;
    }
    
    await next();
});

// Status monitoring endpoint
app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/status') {
        const poolStats = latexPool.getStats();
        const memoryUsage = process.memoryUsage();
        
        ctx.status = 200;
        ctx.type = 'application/json';
        ctx.body = {
            status: 'ok',
            version: VERSION,
            timestamp: new Date().toISOString(),
            pool: poolStats,
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
            },
            system: {
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                uptime: Math.round(process.uptime()) + ' seconds'
            }
        };
    } else {
        await next();
    }
});

// Compilation endpoint
app.use(async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path === '/compile') {
        const body = ctx.request.body;
        
        // Validate required fields
        if (!body.hospitalName || !body.date || !body.name || !body.medicines) {
            ctx.status = 400;
            ctx.body = { 
                error: 'Missing required fields',
                required: ['hospitalName', 'date', 'name', 'medicines']
            };
            return;
        }

        let safeData;
        try {
            // Validate and sanitize input
            safeData = {
                hospitalName: InputValidator.validateInput(body.hospitalName, 'Hospital name', 50),
                date: InputValidator.validateDate(body.date),
                name: InputValidator.validateInput(body.name, 'Patient name', 30),
                gender: InputValidator.validateInput(body.gender, 'Gender', 10),
                age: InputValidator.validateInput(body.age, 'Age', 10),
                department: InputValidator.validateInput(body.department, 'Department', 30),
                patientId: InputValidator.validateInput(body.patientId, 'Patient ID', 30),
                feeType: InputValidator.validateInput(body.feeType, 'Fee type', 20),
                diagnosis: InputValidator.validateInput(body.diagnosis, 'Diagnosis', 200),
                doctorName: InputValidator.validateInput(body.doctorName, 'Doctor name', 30),
                fee: InputValidator.validateInput(body.fee, 'Fee', 20),
                authCode: InputValidator.validateInput(body.authCode, 'Authorization code', 50),
                customSign: InputValidator.validateBase64Image(body.customSign)
            };

            // Validate medicines
            safeData.medicines = InputValidator.validateMedicines(body.medicines);

            // Escape text fields for LaTeX
            const textFields = [
                'hospitalName', 'date', 'name', 'gender', 'age', 
                'department', 'patientId', 'feeType', 'diagnosis', 
                'doctorName', 'fee', 'authCode'
            ];
            
            textFields.forEach(field => {
                safeData[field] = lescape(safeData[field], {preserveFormatting: true});
            });

            // Escape medicines and combine name with specification
            safeData.medicines = safeData.medicines.map(med => {
                const escapedName = lescape(med.name);
                const escapedSpec = lescape(med.spec);
                const combinedName = escapedSpec ? `${escapedName}\\hfill${escapedSpec}` : escapedName;
                
                return {
                    name: combinedName,
                    quantity: lescape(med.quantity),
                    usage: lescape(med.usage)
                };
            });
        } catch (error) {
            console.error(`[Input Validation] Validation failed:`, error.message);
            ctx.status = 400;
            ctx.body = { 
                error: 'Input validation failed',
                message: error.message
            };
            return;
        }

        const {
            hospitalName,
            date,
            name,
            gender,
            age,
            department,
            patientId,
            feeType,
            diagnosis,
            doctorName,
            fee,
            medicines,
            authCode,
            customSign
        } = safeData;

        console.log(`[Request] Processing prescription for: ${name}`);

        // Validate authorization code
        if (authCode !== EXPECTED_CODE) {
            ctx.status = 403;
            ctx.body = {
                error: 'Authorization failed',
                device_info: authBase,
                hint: 'Please see getTargetAuthCode function in source code to calculate authorization code'
            };
            return;
        }

        // Generate unique request ID and temporary directory
        const requestId = uuidv4();
        const tempDir = path.join(process.cwd(), 'temp', requestId);
        let compilationSlot = null;
        
        try {
            console.log(`[Request ${requestId}] Starting prescription generation`);
            
            // Create unique temporary directory
            await fs.mkdir(tempDir, { recursive: true });
            console.log(`[Request ${requestId}] Created temporary directory: ${tempDir}`);

            // Write signature image
            const targetImagePath = path.join(tempDir, 'sign.png');
            await Bun.write(targetImagePath, Buffer.from(customSign || signPng, 'base64'));

            // Generate medicine.tex file
            const medicineTexPath = path.join(tempDir, 'medicine.tex');
            const medicineTexContent = medicines.map((med, i) =>
                `\\blockMedicine{${med.name}}{${med.quantity}}{${med.usage}}${i !== medicines.length - 1 ? '\\\\\\\\' : ''}`
            ).join('\n');
            await fs.writeFile(medicineTexPath, medicineTexContent);

            // Generate macro.tex file with template variables
            const updatedMacroTexContent = macroTex
                .replace('\\newcommand{\\textHospitalName}{}', `\\newcommand{\\textHospitalName}{${hospitalName}}`)
                .replace('\\newcommand{\\textPatientDateYear}{\\the\\year}', `\\newcommand{\\textPatientDateYear}{${date.split('-')[0]}}`)
                .replace('\\newcommand{\\textPatientDateMonth}{\\the\\month}', `\\newcommand{\\textPatientDateMonth}{${date.split('-')[1]}}`)
                .replace('\\newcommand{\\textPatientDateDay}{\\the\\day}', `\\newcommand{\\textPatientDateDay}{${date.split('-')[2]}}`)
                .replace('\\newcommand{\\textPatientName}{}', `\\newcommand{\\textPatientName}{${name}}`)
                .replace('\\newcommand{\\textPatientGender}{}', `\\newcommand{\\textPatientGender}{${gender}}`)
                .replace('\\newcommand{\\textPatientAge}{}', `\\newcommand{\\textPatientAge}{${age}}`)
                .replace('\\newcommand{\\textPatientDep}{}', `\\newcommand{\\textPatientDep}{${department}}`)
                .replace('\\newcommand{\\textPatientID}{}', `\\newcommand{\\textPatientID}{${patientId}}`)
                .replace('\\newcommand{\\textPatientFeeType}{}', `\\newcommand{\\textPatientFeeType}{${feeType}}`)
                .replace('\\newcommand{\\textPatientDiag}{}', `\\newcommand{\\textPatientDiag}{${diagnosis}}`)
                .replace('\\newcommand{\\textDoctorName}{}', `\\newcommand{\\textDoctorName}{${doctorName}}`)
                .replace('\\newcommand{\\textFee}{}', `\\newcommand{\\textFee}{${fee}}`)
                .replace('\\newcommand{\\textWatermark}{模板示例}', `\\newcommand{\\textWatermark}{''}`);

            const updatedMacroTexPath = path.join(tempDir, 'macro.tex');
            await fs.writeFile(updatedMacroTexPath, updatedMacroTexContent);

            // Acquire compilation slot
            console.log(`[Request ${requestId}] Waiting for compilation slot...`);
            compilationSlot = await latexPool.acquire();
            console.log(`[Request ${requestId}] Acquired compilation slot, starting LaTeX compilation`);

            // Set up compilation with timeout
            const compilePromise = new Promise((resolve, reject) => {
                const options = {
                    inputs: tempDir,
                    cmd: 'xelatex',
                    passes: 2,
                };

                const latexStream = latex(mainTex, options);

                const timeout = setTimeout(() => {
                    latexStream.destroy();
                    reject(new Error(`LaTeX compilation timeout (${COMPILATION_TIMEOUT_MS/1000} seconds)`));
                }, COMPILATION_TIMEOUT_MS);

                const chunks = [];
                latexStream.on('data', chunk => chunks.push(chunk));
                latexStream.on('end', () => {
                    clearTimeout(timeout);
                    resolve(Buffer.concat(chunks));
                });
                latexStream.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });

            // Execute compilation
            const pdfBuffer = await compilePromise;
            console.log(`[Request ${requestId}] LaTeX compilation completed, PDF size: ${pdfBuffer.length} bytes`);

            ctx.status = 200;
            ctx.type = 'application/pdf';
            ctx.body = pdfBuffer;
            
        } catch (error) {
            console.error(`[Request ${requestId}] Compilation failed:`, error);
            ctx.status = 500;
            ctx.body = { 
                error: 'LaTeX compilation failed',
                requestId: requestId
            };
        } finally {
            // Release compilation slot
            if (compilationSlot) {
                compilationSlot.release();
            }
            
            // Clean up temporary directory
            try {
                if (fsSync.existsSync(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                    console.log(`[Request ${requestId}] Cleaned up temporary directory: ${tempDir}`);
                }
            } catch (cleanupError) {
                console.error(`[Request ${requestId}] Failed to clean up temporary directory:`, cleanupError.message);
            }
        }
    } else {
        await next();
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

/**
 * Legal Notice and Usage Warning
 * This program is intended for internal use by medical institutions and licensed practicing physicians
 * for technical verification and typesetting assistance only.
 * 
 * Illegal Medical Practice Risk: Non-practicing physicians using this software to issue prescriptions
 * constitutes illegal medical practice, violating the "People's Republic of China Practicing Physicians Law"
 * and related laws and regulations.
 * 
 * Legal Liability: Users must bear all legal consequences arising from illegal prescription issuance
 * (including but not limited to administrative penalties and criminal liability).
 * 
 * Clinical Decision Making: Documents generated by this software do not constitute medical diagnosis advice.
 * Final prescription content must be reviewed by a pharmacist before taking effect.
 * 
 * Authorization Code Calculation:
 * 1. Concatenate username, device name, and CPU core count
 * 2. Perform SHA256 hash on the concatenated string
 * 3. Take the first 12 characters of the hash (uppercase hex format)
 */
