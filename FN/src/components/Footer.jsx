export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="nx-footer">
      <div className="nx-footer-socials" aria-label="Social media">
        <a href="#" aria-label="Facebook">f</a>
        <a href="#" aria-label="Instagram">◯</a>
        <a href="#" aria-label="Twitter">𝕏</a>
        <a href="#" aria-label="YouTube">▶</a>
      </div>

      <div className="nx-footer-links">
        <div>
          <a href="#">Audio Description</a>
          <a href="#">Investor Relations</a>
          <a href="#">Legal Notices</a>
        </div>
        <div>
          <a href="#">Help Center</a>
          <a href="#">Jobs</a>
          <a href="#">Cookie Preferences</a>
        </div>
        <div>
          <a href="#">Gift Cards</a>
          <a href="#">Terms of Use</a>
          <a href="#">Corporate Information</a>
        </div>
        <div>
          <a href="#">Media Center</a>
          <a href="#">Privacy</a>
          <a href="#">Contact Us</a>
        </div>
      </div>

      <button className="nx-footer-service">Service Code</button>

      <p className="nx-footer-copy">© {year} CineBook</p>
    </footer>
  );
}
