import { color, sleep, write } from "bun";
import { Elysia } from "elysia";

import { appendFile } from "node:fs/promises";

function write_bigint_to_array(array: Uint8Array, writepos: number, value: bigint) {
    const my_view = new DataView(array.buffer);
    my_view.setUint32(writepos, Number(value), true);
}

let total_header_size = 54n;
let bits_per_pixel = 8n;
let padding = -1n;
let total_padding = -1n;
let image_size = -1n;
let color_count = 256n;
let file_size = -1n;
let image_data_offset = 54n + color_count * 4n;

console.log("Connecting Elysia...");

let start_time;

let width = -1n;
let height = -1n;

let target_x_m = -1n;
let target_x_n = -1n;

let target_y_m = -1n;
let target_y_n = -1n;

let range_m = -1n;
let range_n = -1n;

let max_iteration = -1n;

let expected_fragments = -1n;
let recieved_fragments = -1;

let fragments = [-1];

let working = false;
let initializing = false;

async function finalize() {
    console.log("All fragments recieved, finalizing...");
    for (let i = 0; i < expected_fragments; i++) {
        let fragment_data = Bun.file(`output/${i}.bmp`);

        console.log(fragment_data.name);

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
                else {
                    // console.log("Not working, unable to resolve");
                }

                if (recieved_fragments >= expected_fragments) {
                    resolve("")
                    break;
                }

                await sleep(1000);
            }
        })

        if (recieved_fragments >= expected_fragments) {
            // console.log("Unable to resolve, all fragments recieved");

            const buffer = new ArrayBuffer(8);
            const view = new DataView(buffer);

            view.setBigUint64(0, BigInt(0xffffffffffffffffn), true);

            console.log(`Stop signal ${view.getBigUint64(0, true)} sent`);
            console.log("----- GET RESPONSE ------")

            return view;
        }

        for (let i = 0; i < expected_fragments; i++) {
            if (fragments[i] == 0) {
                fragments[i] = 1;

                const buffer = new ArrayBuffer(8);
                const view = new DataView(buffer);

                view.setBigUint64(0, BigInt(i), true);

                console.log(`Fragment ${view.getBigUint64(0, true)} sent`);

                console.log("------ GET RESPONSE ------")
                return view;
            }
        }
    })

    .post("/fragment", async (context) => {
        console.log("----- POST FRAGMENT -----");

        // @ts-expect-error

        let data = new Uint8Array(context.body);
        let view = new DataView(data.buffer);

        let fragment_i = view.getBigUint64(0, true);

        data = data.slice(8);

        if (recieved_fragments >= expected_fragments) {
            console.log("Request denied, task already finished")
            console.log("Request attempted to send fragment " + fragment_i)
            return;
        }

        recieved_fragments++;

        console.log("Recieved fragment " + fragment_i);
        console.log("Total fragments: " + recieved_fragments);
        console.log("Expected fragments: " + expected_fragments);

        try {
            await Bun.write(`output/${fragment_i}.bmp`, data);
        }
        catch (err) {
            console.log("Write failed:");
            console.log(err);
        }

        if (recieved_fragments >= expected_fragments) {
            working = false;
            initializing = false;

            finalize();
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

        const buffer = new ArrayBuffer(80);
        const array = new BigUint64Array(buffer);

        array[0] = width;
        array[1] = height;
        array[2] = target_x_m;
        array[3] = target_x_n;
        array[4] = target_y_m;
        array[5] = target_y_n;
        array[6] = range_m;
        array[7] = range_n;
        array[8] = max_iteration;
        array[9] = expected_fragments;

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

        const f_params = Bun.file("params.txt");
        const params = (await f_params.text()).split(",");

        width = BigInt(params[0]);
        height = BigInt(params[1]);

        target_x_m = BigInt(params[2]);
        target_x_n = BigInt(params[3]);

        target_y_m = BigInt(params[4]);
        target_y_n = BigInt(params[5]);

        range_m = BigInt(params[6]);
        range_n = BigInt(params[7]);

        max_iteration = BigInt(params[8]);

        expected_fragments = BigInt(params[9]);
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