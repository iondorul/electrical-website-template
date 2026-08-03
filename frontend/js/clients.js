const button = document.getElementById("loadClientsButton");

button.addEventListener("click", loadClients);

async function loadClients() {
  try {
    const token = localStorage.getItem("token");

    const response = await fetch("http://localhost:3000/api/clients", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    const tableBody = document.getElementById("clientsTableBody");

    tableBody.innerHTML = "";

    data.forEach((client) => {
      tableBody.innerHTML += `
        <tr>
          <td>${client.company_name}</td>
          <td>${client.contact_person}</td>
          <td>${client.email}</td>
          <td>${client.phone}</td>
          <td>${client.address}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}
