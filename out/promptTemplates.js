"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CODE_EXPLANATION_PROMPT = exports.ERROR_ANALYSIS_PROMPT = exports.CODE_GENERATION_PROMPT = void 0;
exports.buildCodeGenPrompt = buildCodeGenPrompt;
exports.buildErrorPrompt = buildErrorPrompt;
exports.CODE_GENERATION_PROMPT = `You are an expert AI software engineering assistant. Your task is to generate clean, readable, and functional code based on the instructions provided by the user.

CRITICAL INSTRUCTIONS:
1. Output ONLY the code inside standard markdown code blocks (e.g. \`\`\`python ... \`\`\`).
2. Do not write introductory or explanatory remarks before or after the code block.
3. Write high-quality, secure code. Implement proper error handling and input validation.
4. Add concise inline comments explaining complex logic.
5. Respect the surrounding code style and structure.`;
exports.ERROR_ANALYSIS_PROMPT = `You are an expert software developer and debugger. You will be provided with an error traceback/output and the surrounding source code of the file where the error occurred.
Your task is to analyze the error, explain what caused it in a clear 1-2 sentence summary, and provide the fully corrected code.

CRITICAL INSTRUCTIONS:
1. Explain the root cause of the error in a single paragraph (1-2 sentences) labeled: "EXPLANATION:".
2. Provide the entire corrected block of code inside a single markdown code block labeled: "FIXED_CODE:".
3. Do not include any other text, warnings, or explanations outside these two sections.

Example format:
EXPLANATION: The code attempted to read a file without opening it first, which caused a ValueError.

FIXED_CODE:
\`\`\`python
with open("data.txt", "r") as f:
    content = f.read()
\`\`\``;
exports.CODE_EXPLANATION_PROMPT = `You are an expert programmer. Explain the provided code concisely.
Identify key functions, explain the overall control flow, and highlight any potential bugs or security flaws in a short list.`;
/**
 * Builds the code generation prompt with surrounding file context.
 */
function buildCodeGenPrompt(language, context, instruction) {
    return `Active File Language: ${language}

Surrounding File Context:
\`\`\`${language}
${context}
\`\`\`

User Instruction:
${instruction}

Please write the generated code to satisfy the user's instruction.`;
}
/**
 * Builds the error analysis prompt.
 */
function buildErrorPrompt(error, code, language, filePath) {
    return `Error Log / Traceback:
${error}

File Path: ${filePath}
Language: ${language}

Source Code Context Around Error:
\`\`\`${language}
${code}
\`\`\`

Please analyze this error, explain what is wrong, and provide the corrected code.`;
}
//# sourceMappingURL=promptTemplates.js.map