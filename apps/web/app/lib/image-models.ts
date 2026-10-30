// What draws what, by the names shown next to an image. Shared by server
// and UI; an OpenRouter render reports the connected model's own id instead.
export const IMAGE_MODELS = {
  anima: "Anima Turbo",
  klein: "FLUX.2 Klein 4B",
  upscale: "Real-ESRGAN",
  remove_bg: "BiRefNet",
  // The official catalog's art.
  pruna: "Pruna p-image",
  prunaEdit: "Pruna p-image-edit",
} as const
