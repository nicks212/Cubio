import Link from 'next/link';
import { Box, Building2, MessageSquare, Clock, TrendingUp, Sparkles, ArrowRight, Gem, Bot, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Box className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-foreground">Cubio</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/auth/login"
                className="px-4 py-2 text-foreground hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full mb-6">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">AI-Powered Sales Automation</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            AI-Powered Business Automation Platform
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
            Cubio streamlines your business operations with intelligent automation.
            Manage inventory, track leads, and automate customer communication 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/register"
              className="px-8 py-4 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 group font-medium"
            >
              Start Free Today
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-4 bg-white border border-slate-200 text-foreground rounded-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2 font-medium"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Business Types */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 border-t border-slate-200">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Built for Your Industry
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Cubio adapts to your specific business type with tailored AI workflows
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-2xl border border-slate-200 hover:shadow-lg transition-shadow">
            <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center mb-6">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3">Real Estate Development</h3>
            <p className="text-muted-foreground mb-4">
              AI agents answer apartment inquiries, qualify leads, and recommend units based on budget and preferences — all via Messenger, Instagram, and more.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {['Projects & apartments catalog', 'Lead qualification', 'Bulk floor management', 'Multi-channel AI sales'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white p-8 rounded-2xl border border-slate-200 hover:shadow-lg transition-shadow">
            <div className="w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center mb-6">
              <Gem className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold mb-3">Birthstone Crafts Shop</h3>
            <p className="text-muted-foreground mb-4">
              AI understands zodiac signs, birthstones, and budgets to recommend the perfect jewelry piece to every customer, automatically.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {['Birthstone product catalog', 'Zodiac compatibility', 'AI product recommendations', 'Multi-channel messaging'].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-purple-500 rounded-full" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">How Cubio Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Three simple steps to automate your customer communication</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Zap, step: '01', title: 'Connect Channels', desc: 'Link your Facebook, Instagram, Telegram, WhatsApp, or Viber accounts in minutes.' },
            { icon: Bot, step: '02', title: 'AI Learns Your Business', desc: 'Configure your catalog, pricing, and AI responses. Cubio understands your products and customers.' },
            { icon: TrendingUp, step: '03', title: 'Automate & Grow', desc: 'AI handles inquiries 24/7. You review leads, monitor conversations, and close deals.' },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="relative inline-flex mb-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                  <Icon className="w-8 h-8 text-primary" />
                </div>
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">{step}</span>
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 border-t border-slate-200">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Why Businesses Choose Cubio</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Streamline your operations with intelligent automation</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: MessageSquare, title: 'Instant Responses', desc: 'AI agents respond to every customer inquiry immediately, ensuring no opportunity is lost' },
            { icon: Clock, title: '24/7 Availability', desc: "Never miss inquiries after hours. Your AI assistant works around the clock" },
            { icon: Building2, title: 'Smart Automation', desc: 'Automatically manage inventory, track leads, and qualify customers based on your criteria' },
            { icon: TrendingUp, title: 'Higher Efficiency', desc: 'Focus your team on high-value tasks while AI handles routine operations' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white p-6 rounded-2xl border border-slate-200 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-muted-foreground text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-3xl p-8 sm:p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Business?
          </h2>
          <p className="text-lg text-white/90 mb-8 max-w-2xl mx-auto">
            Join leading businesses using AI to automate their operations and boost efficiency
          </p>
          <Link
            href="/auth/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-primary rounded-xl hover:bg-slate-50 transition-colors font-semibold group"
          >
            Get Started Free
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <Box className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Cubio</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 Cubio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
