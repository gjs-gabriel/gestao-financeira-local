/** Em builds de produção, a UI não deve ecoar o PIN de demo. */
export function shouldExposeDemoPinInUi(): boolean {
  return process.env.NODE_ENV !== "production";
}
