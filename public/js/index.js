document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.querySelector('.menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const homeSection = document.querySelector(".home-section");

  if (sidebar && homeSection && menuToggle) {
      if (window.innerWidth <= 800) {
          menuToggle.addEventListener('click', function() {
              sidebar.classList.toggle('close');
          });
      }
  }
});

function start() {
  console.log("Starting verification status check");
  check_verification_status();
}
