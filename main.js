// Scroll-in animations
const observer = new IntersectionObserver(
  (entries) => entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  }),
  { threshold: 0.1 }
);

document.querySelectorAll(
  '.kf-card, .site-about__text, .site-contact__text'
).forEach(el => {
  el.classList.add('fade-up');
  observer.observe(el);
});

// Nav CTA scrolls to contact
document.querySelector('.js-contact-cta').addEventListener('click', () => {
  document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' });
});

// Contact form
function handleSubmit(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.textContent = 'Message sent.';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
    e.target.reset();
  }, 3000);
}
