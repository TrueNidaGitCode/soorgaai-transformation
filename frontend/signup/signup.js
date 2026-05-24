document.getElementById("signup-form").addEventListener("submit", async function (event) {
    event.preventDefault();

    // ✅ Get form values
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    // ✅ Basic validation
    if (!name || !email || !password) {
        alert("All fields are required!");
        return;
    }

    try {
        // ✅ Send signup request
        const signupEndpoint = window.CONFIG?.AUTH?.REGISTER || 'http://localhost:3000/api/users/signup';
        console.log('📡 Signup endpoint:', signupEndpoint);

        const response = await fetch(signupEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            alert("Signup successful! Please login.");
            window.location.href = "/login/login.html"; // ✅ Fixed: Correct path to login page
        } else {
            alert(data.msg || data.error || "Signup failed!");
        }
    } catch (error) {
        console.error("❌ Signup Error:", error);
        alert("Something went wrong. Please try again.");
    }
});
