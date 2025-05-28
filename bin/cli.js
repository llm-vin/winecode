#!/usr/bin/env node

const WineCode = require('../lib/winecode');

// Simple argument parsing
const args = process.argv.slice(2);
const options = { model: 'grok-3-mini' };

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' || args[i] === '-m') {
    options.model = args[i + 1];
    i++;
  } else if (args[i] === '--api-key' || args[i] === '-k') {
    options.apiKey = args[i + 1];
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Wine Code by llm.vin - AI-powered development assistant');
    console.log('');
    console.log('Usage: winecode [options]');
    console.log('');
    console.log('Options:');
    console.log('  -m, --model <model>    specify AI model to use (default: grok-3-mini)');
    console.log('  -k, --api-key <key>    API key for llm.vin');
    console.log('  -h, --help             display help for command');
    process.exit(0);
  } else if (args[i] === '--version' || args[i] === '-v') {
    console.log('1.3.3');
    process.exit(0);
  }
}

async function main() {
  const winecode = new WineCode(options);
  await winecode.start();
}

main().catch(console.error);
