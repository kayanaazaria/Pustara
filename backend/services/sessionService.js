const UAParser = require("ua-parser-js");
const { getPool } = require("../config/database");

async function createSession(req, firebase_uid) {
const uaString =
    req.get("User-Agent") ||
    req.headers["user-agent"] ||
    "Unknown";

console.log("🔥 UA STRING:", uaString);

const parser = new UAParser(uaString);
const result = parser.getResult();

    const browser = result.browser.name || "Unknown";
    const os = result.os.name || "Unknown";

    const device_name = `${browser} on ${os}`;

    const ip =
        req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress;

    const pool = getPool();

    const query = `
        INSERT INTO active_sessions
        (
            firebase_uid,
            device_name,
            browser,
            os,
            ip_address
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;

    const values = [
        firebase_uid,
        device_name,
        browser,
        os,
        ip
    ];

    const resultDb = await pool.query(query, values);

    return resultDb.rows[0];
}

module.exports = {
    createSession
};