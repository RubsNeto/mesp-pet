const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

function absoluteFile(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || !path.isAbsolute(value))
    throw new Error('Informe um caminho absoluto para o arquivo.');
  return path.resolve(value);
}
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function copyFile({ source, destination, overwrite = false } = {}) {
  const from = absoluteFile(source);
  const to = absoluteFile(destination);
  if (typeof overwrite !== 'boolean') throw new Error('overwrite deve ser booleano.');
  if (from.toLowerCase() === to.toLowerCase() && process.platform === 'win32')
    throw new Error('Origem e destino devem ser diferentes.');
  if (from === to) throw new Error('Origem e destino devem ser diferentes.');
  const original = await fs.promises.stat(from);
  if (!original.isFile()) throw new Error('A origem precisa ser um arquivo.');
  const before = await digest(from);
  await fs.promises.copyFile(from, to, overwrite ? 0 : fs.constants.COPYFILE_EXCL);
  const [after, copied] = await Promise.all([digest(from), digest(to)]);
  if (before !== after || after !== copied)
    throw new Error('A origem mudou durante a cópia ou os bytes não conferem.');
  return { source: from, destination: to, bytes: original.size, sha256: copied, verified: true };
}

const copyTool = {
  name: 'copy_file',
  description:
    'Copy an existing file anywhere accessible on this computer, preserving every byte, encoding and newline. SHA-256 verification is automatic. Prefer this tool over reconstructing a file with read/write. Existing destinations are preserved unless overwrite=true is explicitly requested.',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Absolute path of the existing source file.' },
      destination: {
        type: 'string',
        description: 'Absolute destination file path; its parent directory must exist.',
      },
      overwrite: {
        type: 'boolean',
        default: false,
        description: 'Replace an existing destination only when requested.',
      },
    },
    required: ['source', 'destination'],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
};

function startServer() {
  const lines = readline.createInterface({ input: process.stdin });
  const reply = (id, result) =>
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  lines.on('line', async (line) => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      return;
    }
    if (request.id == null) return;
    try {
      if (request.method === 'initialize')
        return reply(request.id, {
          protocolVersion: request.params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mesp-computer', version: '1.0.0' },
        });
      if (request.method === 'ping') return reply(request.id, {});
      if (request.method === 'tools/list') return reply(request.id, { tools: [copyTool] });
      if (request.method === 'tools/call') {
        if (request.params?.name !== copyTool.name) throw new Error('Ferramenta desconhecida.');
        const copied = await copyFile(request.params.arguments);
        return reply(request.id, { content: [{ type: 'text', text: JSON.stringify(copied) }] });
      }
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32601, message: 'Method not found' },
        }) + '\n',
      );
    } catch (error) {
      reply(request.id, { isError: true, content: [{ type: 'text', text: error.message }] });
    }
  });
}
module.exports = { copyFile, startServer };
if (require.main === module) startServer();
