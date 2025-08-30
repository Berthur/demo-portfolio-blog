
/**
 * General scripts needed for the website navigation to function
 */

const sidebarButton = document.getElementById('sidebarButton');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.getElementById('sidebar');

sidebarButton?.addEventListener('click', e => {
    sidebarOverlay?.classList?.toggle('active');
});

sidebarOverlay?.addEventListener('click', e => {
    sidebarOverlay?.classList?.remove('active');
});

sidebar?.addEventListener('click', e => {
    e.stopPropagation();
});
