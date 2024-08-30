export function showLoadingScreen(show) {
    const loadingScreen = document.querySelector('#loading-screen');
    if (!loadingScreen) {
        console.error('Loading screen element not found!');
        return;
    }
    if (show) {
        loadingScreen.classList.remove('remove');
        console.log("Showing loading screen");
    } else {
        loadingScreen.classList.add('remove');
        console.log("Hiding loading screen");
    }
}
