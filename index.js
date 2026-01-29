import koa from 'koa';
import bodyParser from 'koa-bodyparser';
import logger from 'koa-logger';
import latex from 'node-latex';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import lescape from 'escape-latex';;

import mainTex from "./tex/main.tex" with { type: "text" };
import macroTex from "./tex/macro.tex" with { type: "text" };
import indexHTML from "./index.html" with { type: "text" };

import packageJson from "./package.json" with { type: "json" };
import { signPng } from './signPng';

const VERSION = packageJson.version;

const app = new koa();

app.use(logger());
app.use(bodyParser({
    jsonLimit: '5mb'
}));


showLegalWarning()

console.log(`[License] 授权基准: ${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`);
console.log(`[License] 查看源码中的 getTargetAuthCode 函数以获取授权码计算方法`);

console.log(`[Hint] 可以通过环境变量 PORT 自定义服务器监听端口，当前端口: ${process.env.PORT || 3000}`);


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
        ctx.body = indexHTML.replace('{{VERSION}}', VERSION).replace('{{AUTH_BASE}}', `${os.userInfo().username}@${os.hostname()}-${os.cpus().length}`);
    } else {
        await next();
    }
});

app.use(async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.path === '/compile') {

        // 定义需要保护的字段（除 medicines 数组外）
        const textFields = [
            'hospitalName', 'date', 'name', 'gender', 'age', 
            'department', 'patientId', 'feeType', 'diagnosis', 
            'doctorName', 'fee', 'authCode'
        ];

        // 对简单文本字段进行转义
        const safeData = {};
        textFields.forEach(field => {
            safeData[field] = lescape(String(ctx.request.body[field] || ''), {preserveFormatting: true});
        });

        // 特殊处理 medicines 数组
        safeData.medicines = (ctx.request.body.medicines || []).map(med => ({
            name: lescape(med.name).replace('\\textbackslash{}hfill','\\hfill'), // 药品名称保留排版
            quantity: lescape(med.quantity),
            usage: lescape(med.usage)
        }));

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

        console.log(safeData)

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
                `\\blockMedicine{${med.name}}{${med.quantity}}{${med.usage}}${i != medicines.length - 1 ? '\\\\\\\\' : ''}`
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

            // Compile LaTeX to PDF - 使用内存流避免磁盘写入
            const options = {
                inputs: tempDir,
                cmd: 'xelatex',
                passes: 2,
            };

            const latexStream = latex(mainTex, options);

            // 使用内存缓冲区收集PDF数据
            const pdfBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                latexStream.on('data', chunk => chunks.push(chunk));
                latexStream.on('end', () => resolve(Buffer.concat(chunks)));
                latexStream.on('error', reject);
            });

            ctx.status = 200;
            ctx.type = 'application/pdf';
            ctx.body = pdfBuffer;
        } catch (error) {
            ctx.status = 500;
            ctx.body = { error: 'Failed to compile LaTeX code', details: error.message };
            console.log(error.message)
        } finally {
            // 自动清理临时目录
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                    console.log(`[Cleanup] Temporary directory removed: ${tempDir}`);
                }
            } catch (cleanupError) {
                console.error(`[Error] Failed to cleanup temp directory ${tempDir}:`, cleanupError.message);
            }
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
