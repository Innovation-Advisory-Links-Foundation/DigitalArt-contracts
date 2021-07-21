require("dotenv").config()

import fs from 'fs'
import utils from "./utils"
import express from 'express'
import cors from 'cors'

/** Simple Express server to make Google Cloud Vision AI client requests. */
const app = express()
const port = process.env.PORT

// Middlewares.
app.use(cors())
app.use(
    express.urlencoded({
        extended: true,
        limit: process.env.REQUEST_LIMIT || "100kb",
    })
)
app.use(express.text({ limit: process.env.REQUEST_LIMIT || "100kb" }))
app.use(express.json({ limit: process.env.REQUEST_LIMIT || "100kb" }))

// Routes.
app.post('/detect', async (req, res) => {
    // Retrieve the image IPFS CID.
    const ipfsCID = req.body.ipfsCID
    const filename = ipfsCID.split("/")[4] + ".jpg"

    utils.downloadImageLocally(ipfsCID, filename, async function () {
        console.log("Detection started for: ", ipfsCID)

        // Make the call.
        res.send(await utils.doWebDetection(filename))

        // Remove the downloaded file.
        fs.unlinkSync(`./${filename}`)

        console.log("Detection completed")
    })
})

// Start the server.
app.listen(port, () => {
    console.log(`Start web detecting images making requests at http://localhost:${port}/detect`)
})