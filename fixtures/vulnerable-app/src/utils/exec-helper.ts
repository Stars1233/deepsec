// VULN: rce — child_process.exec with user input

import { exec, execSync } from "child_process";

export function runCommand(userInput: string): Promise<string> {
  // Vulnerable: user input passed directly to exec
  return new Promise((resolve, reject) => {
    exec(`ls -la ${userInput}`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export function pingHost(host: string): string {
  // Vulnerable: user input in execSync
  return execSync(`ping -c 1 ${host}`).toString();
}

export function evalTemplate(template: string): unknown {
  // Vulnerable: eval with user input
  return eval(template);
}
