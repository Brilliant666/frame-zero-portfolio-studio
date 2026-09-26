import { createInterface } from 'node:readline/promises';
import { readAccountConfig } from './lib/account-config.mjs';
import { createAccountRuntime } from '../db/accounts/runtime.mjs';
import { provisionAccount } from '../db/accounts/provision.mjs';

function hiddenPassword() {
  if (!process.stdin.isTTY) throw new Error('Interactive terminal required.');
  process.stdout.write('初始密码（12–128 字符，不回显）：');
  return new Promise((resolve,reject) => {
    let value = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const finish = () => { process.stdin.off('data',read); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const read = chunk => {
      for (const ch of chunk) {
        if (ch === '\u0003') { finish(); reject(new Error('Cancelled.')); return; }
        if (ch === '\r' || ch === '\n') { finish(); resolve(value); return; }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0,-1);
        else if (ch >= ' ' && value.length < 129) value += ch;
      }
    };
    process.stdin.on('data',read);
  });
}
let runtime;
try {
  if (process.argv.length !== 2 || !process.stdin.isTTY) throw new Error('Run interactively without command-line credentials.');
  const config = readAccountConfig();
  if (config.isTest) throw new Error('Use integration tests for synthetic accounts.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const username = (await prompt.question('用户名（例如 star）：')).trim();
  const slug = (await prompt.question('Site slug（例如 star）：')).trim();
  const email = (await prompt.question('真实登录邮箱：')).trim();
  const premium = (await prompt.question('授予高级拍立得内部测试权限？输入 yes：')).trim() === 'yes';
  prompt.close();
  const password = await hiddenPassword();
  runtime = createAccountRuntime(config);
  const result = await provisionAccount(runtime, { username, slug, email, password, premium });
  console.log(`开户结果：${result.status}。邮箱未标记验证；未迁移摄影内容。`);
} catch { console.error('开户未完成；请检查输入和本地数据库。重复执行不会覆盖已有账号。'); process.exitCode = 1; }
finally { await runtime?.pool.end(); }
