import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary selection:text-on-primary">
      <Navbar />
      <main className="flex-grow flex flex-col items-center justify-center w-full px-[10vw] pt-32 pb-24 max-w-[1200px] mx-auto">
        <section className="w-full mb-24 text-center">
          <h1 className="font-display-lg text-display-lg text-on-background mb-4">Focus is power.</h1>
          <p className="font-body-md text-body-md text-secondary opacity-70 max-w-2xl mx-auto">
            MoneyType is a minimalist typing experience designed for those who find rhythm in the click of a key and clarity in the flow of a sentence.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full">
          <div className="md:col-span-8 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">bolt</span>
              <h2 className="font-stat-label text-stat-label uppercase tracking-widest text-primary">The Mission</h2>
            </div>
            <h3 className="font-stat-value text-stat-value mb-6 text-on-background">Flow state as a service.</h3>
            <div className="space-y-4 text-secondary leading-relaxed font-body-md text-body-md opacity-80">
              <p>In an age of constant digital distraction, MoneyType exists to reclaim the single most important tool in a creator's arsenal: focused attention. We believe that typing isn't just data entry; it's the bridge between thought and expression.</p>
              <p>By removing unnecessary UI chrome, leaderboards that prioritize vanity over progress, and heavy visual effects, we provide a clean slate. Here, there is only you, the prompt, and the rhythmic beat of your own progress.</p>
            </div>
          </div>

          <div className="md:col-span-4 bg-surface-container relative overflow-hidden rounded-xl group border border-outline-variant/30">
            <div className="absolute inset-0 opacity-20 grayscale group-hover:grayscale-0 transition-all duration-700">
              <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAVw55mgr2MFLQbKISRK_802jd9-8fxsfFXGasqsUhl-xkywGK2vtismgLQuCeZfyz2i-Xj-0QNNGO6BfNtoIq7IZ42_oSdOmqrE1YoQnhBEl7xVYjdVyIk7Juu5pjqlqA0UqGvp9Vy3yFwHC_QYrdHMK21GNcEWya9NHGamvuB-2dxD3i2tjjCN_eR3vtNWKN78sdjRvRSPpNm3iX-6RCDqjShLAokC7FJizhoaWpvi31yRS15SBqa')" }}></div>
            </div>
            <div className="relative z-10 p-8 h-full flex flex-col justify-end bg-gradient-to-t from-background via-transparent to-transparent">
              <p className="font-label-sm text-label-sm text-primary uppercase tracking-widest mb-2">Philosophy</p>
              <p className="font-body-md text-body-md text-on-background">Elegance in simplicity. Performance in silence.</p>
            </div>
          </div>

          <div className="md:col-span-6 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30 group cursor-pointer">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">code</span>
              <h2 className="font-stat-label text-stat-label uppercase tracking-widest text-primary">Open Source</h2>
            </div>
            <p className="font-body-md text-body-md text-secondary opacity-80 mb-8 leading-relaxed">
              MoneyType is built by the community, for the community. Our codebase is transparent, auditable, and open for contributions on GitHub.
            </p>
            <a className="inline-flex items-center gap-2 font-body-md text-body-md text-on-background relative py-1 group/link" href="#">
              View on Github
              <span className="material-symbols-outlined text-sm group-hover/link:translate-x-1 transition-transform">arrow_forward</span>
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary group-hover/link:w-full transition-all duration-300"></span>
            </a>
          </div>

          <div className="md:col-span-6 bg-surface-container-low p-8 rounded-xl border border-outline-variant/30">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary">alternate_email</span>
              <h2 className="font-stat-label text-stat-label uppercase tracking-widest text-primary">Contact</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-label-sm text-label-sm text-secondary opacity-50 mb-1">Support & Feedback</p>
                <p className="font-body-md text-body-md text-on-background">hello@MoneyType.io</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-secondary opacity-50 mb-1">Community</p>
                <a className="font-body-md text-body-md text-primary hover:underline" href="#">Join Discord</a>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-outline-variant/20 flex gap-6">
              <a href="#" className="text-secondary hover:text-primary transition-colors"><span className="material-symbols-outlined">brand_awareness</span></a>
              <a href="#" className="text-secondary hover:text-primary transition-colors"><span className="material-symbols-outlined">share</span></a>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
