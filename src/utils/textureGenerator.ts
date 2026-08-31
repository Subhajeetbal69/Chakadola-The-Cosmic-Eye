import * as THREE from 'three';

export function generateNoiseTexture(size: number = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error("Could not get 2D context");
  const imgData = context.createImageData(size, size);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Generate gritty noise
    const noise = Math.random() * 255;
    data[i] = noise;     // red
    data[i + 1] = noise; // green
    data[i + 2] = noise; // blue
    data[i + 3] = 255;   // alpha
  }
  
  context.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
