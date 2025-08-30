
/**
 * General scripts needed for the website navigation to function
 */

document.getElementById('sidebarButton')?.addEventListener('click', e => {
    document.getElementById('sidebar')?.classList?.toggle('active');
});
