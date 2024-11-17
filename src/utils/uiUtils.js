let loadingCounter = 0; // Counter to keep track of loading components

export function showLoadingScreen(show, isKeplrConnected, onConnectKeplr) {
    const loadingScreen = document.querySelector('#loading-screen');
    if (!loadingScreen) {
        console.error('Loading screen element not found!');
        return;
    }

    if (show) {
        loadingCounter++; // Increment counter when showing the loading screen
        
        if (loadingCounter === 1) {
            loadingScreen.classList.remove('remove'); // Show the loading screen only when the first component loads
            

            console.log('Loading screen is now visible.');
        }
    } else {
        loadingCounter--; // Decrement counter when hiding
        
        if (loadingCounter <= 0) {
            loadingCounter = 0; // Reset counter to zero if it goes negative
            loadingScreen.classList.add('remove'); // Hide the loading screen only when all components are done
            loadingScreen.innerHTML = ''; // Clear any loading content
            console.log('All components have finished loading. Hiding loading screen.');
        }
    }
}
