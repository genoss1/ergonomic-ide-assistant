const NodeWebcam: any = require("node-webcam");

function normalizeToBase64(data: any): string {
  if (Buffer.isBuffer(data)) return data.toString("base64");
  if (typeof data === "string") return data;
  return Buffer.from(data).toString("base64");
}
/**
 * Manager kamery używany przez rozszerzenie.
 *
 * Realizuje wykonywanie zdjęć po stronie Extension Host (Node.js),
 * omijając ograniczenia WebView (`getUserMedia`) na Windows.
 */
export class CameraManager {
  private webcam: any;

  constructor() {
    this.webcam = NodeWebcam.create({
      width: 640,
      height: 480,
      quality: 80,
      output: "jpeg",
      callbackReturn: "base64",
    });
  }
  /**
   * Wykonuje pojedyncze zdjęcie i zwraca je jako base64 (JPEG).
   *
   * @param name Nazwa pliku roboczego używana przez bibliotekę.
   * @returns Obraz w formacie base64 (bez prefiksu `data:image/...`).
   * @throws Błąd, jeśli kamera nie zwróci danych lub wystąpi problem systemowy.
   */
  capture(name: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.webcam.capture(name, (err: Error | null, data: any) => {
        if (err) return reject(err);
        if (!data) return reject(new Error("Kamera zwróciła pusty obraz."));
        resolve(normalizeToBase64(data));
      });
    });
  }
}
