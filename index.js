import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import logger from 'koa-logger';
import latex from 'node-latex';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

import mainTex from "./tex/main.tex" with { type: "text" };
import macroTex from "./tex/macro.tex" with { type: "text" };
import indexHTML from "./index.html" with { type: "text" };

const signPng = "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"

import packageJson from "./package.json" with { type: "json" };

const VERSION = packageJson.version;

const app = new koa();

app.use(logger());
app.use(bodyParser({
    jsonLimit: '5mb'
}));


showLegalWarning()

console.log(`[License] 授权基准: ${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`);
console.log(`[License] 查看源码中的 getTargetAuthCode 函数以获取授权码计算方法`);

const EXPECTED_CODE = getTargetAuthCode();

app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/source') {
        ctx.status = 200;
        ctx.body = `本程序基于 AGPL-3.0 协议开源。请访问以下地址获取完整代码：\n${packageJson.repository.url}`;
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    if (ctx.method === 'GET' && ctx.path === '/') {
        ctx.status = 200;
        ctx.type = 'text/html';
        ctx.body = indexHTML.replace('{{VERSION}}', VERSION);
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path === '/compile') {
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
        } = ctx.request.body;

        if (!hospitalName || !date || !name || !medicines || medicines.length === 0) {
            ctx.status = 400;
            ctx.body = { error: 'Required fields are missing or incomplete' };
            return;
        }

        
        const watermark = '';

        if (authCode !== EXPECTED_CODE) {
            ctx.status = 403;
            ctx.body = { 
                error: '授权校验失败', 
                device_info: `${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`,
                hint: '请阅读源码中的 getTargetAuthCode 函数手动计算授权码' 
            };
            return;
        }

        try {
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const targetImagePath = path.join(tempDir, 'sign.png');
            await Bun.write(targetImagePath, Buffer.from(customSign || signPng, 'base64'));

            // Generate medicine.tex dynamically
            const medicineTexPath = path.join(tempDir, 'medicine.tex');
            const medicineTexContent = medicines.map((med, i) => 
                `\\blockMedicine{${med.name}}{${med.quantity}}{${med.usage}}${i!=medicines.length-1?'\\\\\\\\':''}`
            ).join('\n');
            fs.writeFileSync(medicineTexPath, medicineTexContent);

            // Use macro.tex as the base template
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
                .replace('\\newcommand{\\textWatermark}{模板示例}', `\\newcommand{\\textWatermark}{${watermark}}`);

            const updatedMacroTexPath = path.join(tempDir, 'macro.tex');
            fs.writeFileSync(updatedMacroTexPath, updatedMacroTexContent);

            // Compile LaTeX to PDF
            const pdfPath = path.join(tempDir, 'output.pdf');
            const options = {
                inputs: tempDir,
                cmd: 'xelatex',
                passes: 2, 
            };

            const writeStream = fs.createWriteStream(pdfPath);
            const latexStream = latex(mainTex, options);

            latexStream.pipe(writeStream);

            await new Promise((resolve, reject) => {
                latexStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            const pdfBuffer = fs.readFileSync(pdfPath);
            ctx.status = 200;
            ctx.type = 'application/pdf';
            ctx.body = pdfBuffer;
        } catch (error) {
            ctx.status = 500;
            ctx.body = { error: 'Failed to compile LaTeX code', details: error.message };
        }
    } else {
        await next();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});



function showLegalWarning() {
    const width = 60;
    const line = "═".repeat(width);
    const title = `PRESCRIPTION GENERATOR v${VERSION} `;
    
    console.log(`\x1b[33m╔${line}╗\x1b[0m`);
    console.log(`\x1b[33m║\x1b[41m\x1b[37m${title.padStart((width + title.length) / 2).padEnd(width)}\x1b[0m\x1b[33m║\x1b[0m`);
    console.log(`\x1b[33m╠${line}╣\x1b[0m`);
    
    const content = [
        "           【 法律声明与开源协议 】           ",
        "",
        `  本程序受 GNU AGPLv3 协议授权。             `,
        "  任何基于本项目的衍生服务必须向用户公开源代码。   ",
        "",
        "  [ 警告 ] 非执业医师严禁使用此工具非法行医。   ",
        "  软件作者不承担因使用者违规操作产生的任何法律责任。",
        "",
        `  Source Code: ${packageJson.repository?.url || "获取错误"}`
    ];

    content.forEach(text => {
        const padding = width - text.replace(/[^\x00-\xff]/g, "  ").length;
        const leftPad = Math.floor(padding / 2);
        console.log(`\x1b[33m║\x1b[0m${" ".repeat(leftPad)}${text}${" ".repeat(padding - leftPad)}\x1b[33m║\x1b[0m`);
    });

    console.log(`\x1b[33m╚${line}╝\x1b[0m\n`);
}

/**
 * 【法律声明与使用警告】
 * 本程序仅供医疗机构内部及持证执业医师进行技术验证与辅助排版使用。
 * 非法行医风险：非执业医师利用本软件开具处方属于非法行医行为，违反《中华人民共和国执业医师法》及相关法律法规。
 * 法律责任：使用者须自行承担因违规开具处方产生的一切法律后果（包括但不限于行政处罚与刑事责任）。
 * 临床决策：本软件生成的文档不具备医疗诊断建议，最终处方内容须经药剂师审核后方可生效。
 * 授权码：
 * 1. 拼接 用户名、设备名、CPU核心数
 * 2. 对拼接后的字符串进行 SHA256 哈希
 * 3. 取哈希值（大写 Hex 格式）的前 12 位
 */
function getTargetAuthCode() {
    const rawInfo = `${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`;
    const hash = crypto.createHash('sha256').update(rawInfo).digest('hex').toUpperCase();
    return hash.slice(0, 12); 
}