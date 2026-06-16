const username = "testuser";
const password = "password";
const backendUrl = "http://127.0.0.1:8000";

async function test() {
    try {
        console.log("Testing Registration...");
        let response = await fetch(`${backendUrl}/auth/register`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({username, password})
        });
        let data = await response.json();
        console.log("Register response:", response.status, data);

        console.log("Testing Login...");
        response = await fetch(`${backendUrl}/auth/login`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({username, password})
        });
        data = await response.json();
        console.log("Login response:", response.status, data);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}
test();
