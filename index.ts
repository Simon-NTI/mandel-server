import { sleep } from "bun";
import { Elysia } from "elysia";

// TODO
// Setup stream for post requests to buffer data

console.log("Connecting Elysia...");



let expected_fragments = 0;
let recieved_fragments = 0;

let working = false;

const app = new Elysia()
    .onParse(async ({ request }) => {
        const arrayBuffer = await Bun.readableStreamToArrayBuffer(request.body!);
        const rawBody = Buffer.from(arrayBuffer);
        return rawBody
    })

    .put("/fragment", (context) => {
        console.log("put req recieved...");
        console.log(context);
    })

    .post("/fragment", async (context) => {
        console.log("post req recieved...");

        // Accumulate the incoming data chunks from the readable stream

        // Combine chunks into a single Uint8Array
        // @ts-expect-error
        const data = new Uint8Array(context.body);

        // Write the binary data directly to a file
        await Bun.write("output/out.bmp", data);

        try {
            await Bun.write("output/out.bmp", data);

            console.log("Successfully wrote to file")
        }
        catch (err) {
            console.log("Write failed:");
            console.log(err);
        }
    })

    .get("/begin", async () => {
        await new Promise(async (resolve) => {
            while (true) {
                console.log("Entered loop");
                if (working) {
                    resolve("");
                    break;
                }

                await sleep(1000);
            }
        })

        console.log("Resolved");
        return Date.now();
    })


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

        // read data from config file instead of console to prevent formattng

        working = true;
    }

    if (line == "help") {
        console.log("width, height, center_x, center_y, range_x, range_y, max_iteration, monochrome, fragment_width, fragment_height");
    }
}