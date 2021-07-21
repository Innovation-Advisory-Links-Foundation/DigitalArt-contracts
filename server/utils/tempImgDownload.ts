import fs from 'fs'
import request from 'request'

/**
 * Download a remote image and store it until the web detection ends.
 * @param url <string> - The URL where the remote image is located.
 * @param filename <string> - The name of the temporary file.
 * @param callback <() => Promise<any>> - The function which call the Google Vision AI APIs and returns.
 */
 export default function downloadImageLocally (url: string, filename: string, detect: () => Promise<any>) {
    request.head(url, (err: any, res: any, body: any) => {
        request(url).pipe(fs.createWriteStream(filename)).on('close', detect)
    })
}