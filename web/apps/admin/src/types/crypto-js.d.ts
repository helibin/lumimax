declare module 'crypto-js' {
  const CryptoJS: {
    MD5(value: string): { toString(): string };
  };

  export default CryptoJS;
}
