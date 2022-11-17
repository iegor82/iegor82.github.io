
const registerPeriodicSync = async () => {
    const status = await navigator.permissions.query({
        name: 'periodic-background-sync'
    });

    if (status.state == 'granted') {
        const registration = await navigator.serviceWorker.ready;
        await registration.periodicSync.register('get-latest-text', { minInterva: 60 * 1000 });
    }
};


export const register = async () => {
    console.log('Test');

    try {
        const registration = await navigator.serviceWorker.register('sw.js', { scope: '/ChromePermissionCrash/' });

        if (registration.installing) {
            console.log('Service worker installing');
        } else if (registration.waiting) {
            console.log('Service worker installed');
        } else if (registration.active) {
            console.log('Service worker active');
        }


        await registerPeriodicSync();
    } catch (error) {
        console.error(`Failed to register: ${error}`);
    }
};

const startTest = async () => {
    const reply = await fetch('/ChromePermissionCrash/test/');
    const p = document.getElementById('result');
    if (reply) {
        p.innerHTML = await reply.text();
    } else {
        p.innerHTML = 'Error';
    }
}

const registerBtn = document.getElementById('register-btn');
registerBtn.addEventListener('click', register);

const testBtn = document.getElementById('test-btn');
testBtn.addEventListener('click', startTest);