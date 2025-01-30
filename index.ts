import { color, sleep, write } from "bun";
import { Elysia } from "elysia";

import { appendFile } from "node:fs/promises";

function write_bigint_to_array(array: Uint8Array, writepos: number, value: bigint) {
    // for (let i = 0; i < 8; i++) {
    //     // THIS DOES NOT WORK BECAUSE JS SUCKS; PLZ FIX
    //     // array[writepos + i] = ((Number(file_size) >> (i * 8)) & 0xff);

    //     // nvm wrong variable lmao
    //     array[writepos + i] = ((Number(value) >> (i * 8)) & 0xff);
    // }

    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    view.setBigUint64(0, value)
    const temp_array = new Uint8Array(buffer);

    for (let i = 0; i < 8; i++) {
        array[writepos + i] = temp_array[i];
    }
}

let total_header_size = 54n;
let bits_per_pixel = 8n;
let padding = -1n;
let total_padding = -1n;
let image_size = -1n;
let color_count = 256n;
let file_size = -1n;
let image_data_offset = 54n + color_count * 4n;

// TODO
// Setup stream for post requests to buffer data

console.log("Connecting Elysia...");

let start_time;

let width = -1n;
let height = -1n;

let target_x_m = -1n;
let target_x_n = -1n;

let target_y_m = -1n;
let target_y_n = -1n;

let range = -1n;

let max_iteration = -1n;

let expected_fragments = -1n;
let recieved_fragments = -1;

let fragments = [-1];

// Fragment states:
// 0 = Not sent
// 1 = Sent, awaiting data
// 2 = Recieved

let working = false;
let initializing = false;

async function finalize() {
    console.log("All fragments recieved, finalizing...");
    for (let i = 0; i < expected_fragments; i++) {
        let fragment_data = Bun.file(`output/${i}.bmp`);

        const buffer = await fragment_data.arrayBuffer();
        const array = new Uint8Array(buffer);

        await appendFile(`output/final.bmp`, array);
    }

    console.log("Done.");
}

const app = new Elysia()
    .onParse(async ({ request }) => {
        const arrayBuffer = await Bun.readableStreamToArrayBuffer(request.body!);
        const rawBody = Buffer.from(arrayBuffer);
        return rawBody
    })

    .get("/fragment", async () => {
        console.log("----- GET FRAGMENT -----");

        await new Promise(async (resolve) => {
            while (true) {
                if (working) {
                    resolve("");
                    break;
                }

                await sleep(1000);
            }
        })

        for (let i = 0; i < expected_fragments; i++) {
            if (fragments[i] == 0) {
                fragments[i] = 1;

                // const buffer = new ArrayBuffer(8);
                // const view = new DataView(buffer);

                // const array = new Uint8Array(buffer);

                const buffer = new ArrayBuffer(8);
                const array = new BigUint64Array(buffer);

                array[0] = BigInt(i);

                console.log(`Fragment ${i} sent`);

                return array;
            }
        }
    })

    .post("/fragment", async (context) => {
        console.log("----- POST FRAGMENT -----");

        // Accumulate the incoming data chunks from the readable stream

        // Combine chunks into a single Uint8Array
        // @ts-expect-error

        let data = new Uint8Array(context.body);
        let view = new DataView(data.buffer);

        // TODO check if the client is sending the correct fragment num
        // Update, the client sends the correct data, but the server always reads 0
        // Then check if this handles incoming data the way I suspect
        let fragment_i = view.getBigUint64(0);

        data = data.slice(8);
        recieved_fragments++;

        console.log("Recieved fragment " + fragment_i);
        console.log("Total fragments: " + recieved_fragments);
        console.log("Expected fragments: " + expected_fragments);

        try {
            await Bun.write(`output/${fragment_i}.bmp`, data);

            // console.log("Successfully wrote to file")
        }
        catch (err) {
            console.log("Write failed:");
            console.log(err);
        }

        if (recieved_fragments >= expected_fragments) {
            const buffer = new ArrayBuffer(8);
            const array = new Uint8Array(buffer);

            for (let i = 0; i < 8; i++) {
                array[i] = 0xff;
                console.log(array[i]);
            }

            working = false;
            initializing = false;

            finalize();
            return array;
        }
    })

    .get("/init", async () => {
        await new Promise(async (resolve) => {
            while (true) {
                if (initializing) {
                    resolve("");
                    break;
                }

                await sleep(1000);
            }
        })

        const buffer = new ArrayBuffer(72);
        const array = new BigUint64Array(buffer);

        array[0] = width;
        array[1] = height;
        array[2] = target_x_m;
        array[3] = target_x_n;
        array[4] = target_y_m;
        array[5] = target_y_n;
        array[6] = range;
        array[7] = max_iteration;
        array[8] = expected_fragments;

        return array;
    })

    .get("/index", () => { return Bun.file("index.html") })

    .get("/num", () => {
        const buffer = new ArrayBuffer(8);
        const array = new BigUint64Array(buffer);

        array[0] = 123456789n;
        return array;
    })
    .listen({ port: 3031, idleTimeout: 240 });

console.log(`Elysia connected, live on port ${app.server?.port}`);

for await (const line of console) {
    if (line == "init") {
        // Don't do any any processing, just ship the binary data straight to the clients to prevent any weird js witchcraft from occuring

        const f_params = Bun.file("params.txt");
        const params = (await f_params.text()).split(",");

        width = BigInt(params[0]);
        height = BigInt(params[1]);

        target_x_m = BigInt(params[2]);
        target_x_n = BigInt(params[3]);

        target_y_m = BigInt(params[4]);
        target_y_n = BigInt(params[5]);

        range = BigInt(params[6]);

        max_iteration = BigInt(params[7]);

        expected_fragments = BigInt(params[8]);
        recieved_fragments = 0;

        for (let i = 0; i < expected_fragments; i++) {
            fragments[i] = 0;
        }

        start_time = Date.now();

        padding = 4n - (((bits_per_pixel / 8n) * width) % 4n);
        total_padding = padding * height;
        image_size = (bits_per_pixel / 8n) * (width * height) + total_padding;
        file_size = total_header_size + image_size + total_padding + color_count * 4n;

        const buffer = new ArrayBuffer(Number(total_header_size + color_count * 4n));
        const array = new Uint8Array(buffer);

        /* identifier */
        array[0] = 0x42;
        array[1] = 0x4D;

        /* File size in bytes */
        // write_ulong_to_bitmap(2, file_info.file_size);

        write_bigint_to_array(array, 2, file_size);

        /* Reserved field */
        write_bigint_to_array(array, 6, 0n);

        /* Offset to image data, bytes */
        write_bigint_to_array(array, 10, image_data_offset);

        /* Header size in bytes */
        write_bigint_to_array(array, 14, 40n);

        /* Width of image */
        write_bigint_to_array(array, 18, width);

        /* Height of image */
        write_bigint_to_array(array, 22, height);

        /* Number of colour planes */
        array[26] = 1;
        array[27] = 0;

        /* Bits per pixel */
        array[28] = Number(bits_per_pixel);
        array[29] = 0;

        /* Compression type */
        write_bigint_to_array(array, 30, 0n);

        /* Image size in bytes */
        write_bigint_to_array(array, 34, image_size);

        /* Horizontal pixels per meter */
        write_bigint_to_array(array, 38, 0n);

        /* Horizontal pixels per meter */
        write_bigint_to_array(array, 42, 0n);

        /* Number of colours */
        write_bigint_to_array(array, 46, color_count);

        /* Important colours */
        write_bigint_to_array(array, 50, 0n);

        /* Colour palette */
        for (let i = 0; i < Number(color_count); i++) {
            let writepos = Number(total_header_size) + (i * 4);
            array[writepos] = 255 - i;
            array[writepos + 1] = 255 - i;
            array[writepos + 2] = 255 - i;
            array[writepos + 3] = 0;
        }

        try {
            await Bun.write("output/final.bmp", array);

            console.log("Image header successfully written");
        }
        catch (err) {
            console.log("Write failed:");
            console.log(err);
        }

        initializing = true;
    }

    if (line == "begin") {
        working = true;
    }
}