const datasourceOverrideOptions = ['--config', '--url'] as const;

export function assertNoPrismaDatasourceOverrides(arguments_: readonly string[]): void {
  const hasDatasourceOverride = arguments_.some(
    (argument) =>
      datasourceOverrideOptions.includes(argument as (typeof datasourceOverrideOptions)[number]) ||
      datasourceOverrideOptions.some((option) => argument.startsWith(`${option}=`)),
  );

  if (hasDatasourceOverride) {
    throw new Error('Development database commands do not allow Prisma datasource overrides.');
  }
}
