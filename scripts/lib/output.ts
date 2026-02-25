export const printOutput = (data: unknown, asJson: boolean): void => {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (typeof data === 'string') {
    console.log(data);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
};
