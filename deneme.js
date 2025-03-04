fetch("https://api.setscript.com/users/689447667465453599")
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error("Hata oluştu:", error));
