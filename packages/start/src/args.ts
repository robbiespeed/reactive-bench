export function createFilter(
  argValue: string
): undefined | ((value: string) => boolean) {
  const filterValues = argValue.split(",").filter((s) => !!s);
  if (filterValues.length === 0) {
    return undefined;
  }
  return (value) => filterValues.some((f) => value.includes(f));
}
