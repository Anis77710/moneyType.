export default function Footer() {
  return (
    <footer className="bg-transparent border-t border-outline-variant/10">
      <div className="flex justify-between items-center max-w-[1200px] mx-auto px-[10vw] py-12 font-label-sm text-label-sm">
        <div className="text-secondary opacity-30">© 2024 Typee. All rights reserved.</div>
        <div className="flex gap-8 text-secondary">
          <a href="#" className="opacity-30 hover:text-primary hover:opacity-100 transition-opacity duration-200 cursor-pointer">Terms</a>
          <a href="#" className="opacity-30 hover:text-primary hover:opacity-100 transition-opacity duration-200 cursor-pointer">Privacy</a>
          <a href="#" className="opacity-30 hover:text-primary hover:opacity-100 transition-opacity duration-200 cursor-pointer">Twitter</a>
          <a href="#" className="opacity-30 hover:text-primary hover:opacity-100 transition-opacity duration-200 cursor-pointer">GitHub</a>
        </div>
      </div>
    </footer>
  )
}
