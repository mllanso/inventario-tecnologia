export const MAX_RESOURCE_IMAGES=5;
export function validateResourceImages(images){
 if(!Array.isArray(images)||images.length>MAX_RESOURCE_IMAGES||images.some(x=>typeof x!=='string'||x.length>160000||!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(x)))throw Error('Adjuntá hasta cinco imágenes PNG, JPG o WebP válidas.');
 return images;
}
export async function prepareResourceImage(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5000000)throw Error('Elegí imágenes PNG, JPG o WebP de hasta 5 MB cada una.');
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error('No se pudo leer la imagen. Elegí otro archivo.');}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192)throw Error('La imagen debe medir como máximo 8192 píxeles por lado.');
  const scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  return validateResourceImages([canvas.toDataURL('image/png')])[0];
 }finally{bitmap.close();}
}
