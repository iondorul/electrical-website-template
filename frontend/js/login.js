const loginButton = document.getElementById("loginButton");

loginButton.addEventListener("click", login);

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();
    console.log(data);

    localStorage.setItem("token", data.token);
    window.location.href = "clients.html";
  } catch (error) {
    console.error(error);
  }
}
