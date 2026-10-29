# Finds anime faces in an image and prints their boxes as JSON, for the
# face enhance tool (api.postprocess). Runs with ComfyUI's Python, which
# already has onnxruntime, OpenCV and NumPy.
#
#   python detect-faces.py <model.onnx> <image> [threshold]
#
# The model is deepghs/anime_face_detection (YOLOv8, one "face" class).
import json
import sys

import cv2
import numpy as np
import onnxruntime as ort

SIZE = 640


def main():
    model, path = sys.argv[1], sys.argv[2]
    threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.3
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"Could not read {path}")
    h, w = img.shape[:2]

    # Letterbox to SIZE x SIZE, keeping the aspect ratio.
    s = SIZE / max(w, h)
    nw, nh = round(w * s), round(h * s)
    canvas = np.full((SIZE, SIZE, 3), 114, np.uint8)
    canvas[:nh, :nw] = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    x = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None]
    x = x.astype(np.float32) / 255

    session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    out = session.run(None, {session.get_inputs()[0].name: x})[0][0].T
    out = out[out[:, 4] >= threshold]
    boxes = [
        [(cx - bw / 2) / s, (cy - bh / 2) / s, bw / s, bh / s]
        for cx, cy, bw, bh in out[:, :4]
    ]
    scores = out[:, 4].tolist()
    keep = cv2.dnn.NMSBoxes(boxes, scores, threshold, 0.5) if boxes else []
    faces = []
    for i in np.array(keep).flatten():
        bx, by, bw, bh = boxes[i]
        x0, y0 = max(0, bx), max(0, by)
        x1, y1 = min(w, bx + bw), min(h, by + bh)
        faces.append(
            {
                "x": round(x0),
                "y": round(y0),
                "width": round(x1 - x0),
                "height": round(y1 - y0),
                "score": round(scores[i], 3),
            }
        )
    faces.sort(key=lambda f: -f["width"] * f["height"])
    print(json.dumps({"width": w, "height": h, "faces": faces}))


if __name__ == "__main__":
    main()
