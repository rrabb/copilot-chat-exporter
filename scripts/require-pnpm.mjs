if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('Use pnpm install with the pnpm version in package.json. Other package managers are not supported.');
  process.exitCode = 1;
}
