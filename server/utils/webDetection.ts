import vision from '@google-cloud/vision';

export default async function doWebDetection (filename: string) {
    // Create an Image Annotator Client configured w/ the secret.
    const iaClient = new vision.ImageAnnotatorClient({
        keyFile: process.env.SECRET_KEYFILE_PATH
    })

    // Make the API call.
    const [results] = await iaClient.webDetection(`./${filename}`)

    return results.webDetection
}