<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import {
  Activity,
  ArrowRight,
  Download,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Weight,
} from 'lucide-vue-next';
import QRCode from 'qrcode';

const title = import.meta.env.VITE_APP_TITLE || 'LUMIMAX';
const smartDownloadUrl =
  import.meta.env.VITE_APP_DOWNLOAD_URL ||
  import.meta.env.VITE_APP_DOWNLOAD_IOS ||
  import.meta.env.VITE_APP_DOWNLOAD_ANDROID ||
  'https://example.com/download/app';
const iosDownloadUrl = import.meta.env.VITE_APP_DOWNLOAD_IOS || smartDownloadUrl;
const androidDownloadUrl = import.meta.env.VITE_APP_DOWNLOAD_ANDROID || smartDownloadUrl;
const heroImageUrl = `${import.meta.env.BASE_URL}lumimax-scale-hero.svg`;

const iosQr = ref('');
const androidQr = ref('');
const qrVisible = ref(false);
const qrPlatform = ref<'android' | 'ios'>('ios');

const activeQrImage = computed(() => (qrPlatform.value === 'ios' ? iosQr.value : androidQr.value));

const activeQrLabel = computed(() => (qrPlatform.value === 'ios' ? 'iPhone' : 'Android'));

const workflow = [
  {
    eyebrow: '01',
    title: '站上秤面，数据秒级同步',
    copy: '高频称重、稳定识别、家庭成员自动区分，打开 App 就能看到最新记录。',
  },
  {
    eyebrow: '02',
    title: '体重之外，看见更多身体信号',
    copy: '围绕体重趋势、饮食反馈与阶段目标，形成连续而直观的健康轨迹。',
  },
  {
    eyebrow: '03',
    title: '扫码下载，立即开始记录',
    copy: '同一入口支持 iPhone 与 Android，家人分享设备也不需要重新配置。',
  },
];

const features = [
  {
    icon: Weight,
    title: '稳定测量',
    copy: '低重心秤体与大面积秤面，让每天称重更自然。',
  },
  {
    icon: Activity,
    title: '趋势可视化',
    copy: '把每日波动整理成清晰曲线，变化一眼能看懂。',
  },
  {
    icon: ShieldCheck,
    title: '家庭协同',
    copy: '支持多成员使用，同一台设备也能分开沉淀数据。',
  },
];

onMounted(async () => {
  const [iosDataUrl, androidDataUrl] = await Promise.all([
    QRCode.toDataURL(iosDownloadUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#06131a',
        light: '#f5f8fa',
      },
    }),
    QRCode.toDataURL(androidDownloadUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#051219',
        light: '#edf4f8',
      },
    }),
  ]);

  iosQr.value = iosDataUrl;
  androidQr.value = androidDataUrl;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      }
    },
    { threshold: 0.18 },
  );

  for (const element of document.querySelectorAll('[data-reveal]')) {
    observer.observe(element);
  }
});

function showQr(platform: 'android' | 'ios') {
  qrPlatform.value = platform;
  qrVisible.value = true;
}

function hideQr() {
  qrVisible.value = false;
}
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <div class="content-shell topbar-inner">
        <a class="brand" href="#top">
          <span class="brand-mark">LM</span>
          <span class="brand-text">{{ title }}</span>
        </a>
        <nav class="topnav">
          <a href="#features">产品亮点</a>
          <a href="#experience">App 体验</a>
          <a href="#download">下载</a>
        </nav>
      </div>
    </header>

    <main id="top">
      <section class="hero">
        <div class="content-shell hero-shell">
          <div class="hero-copy" data-reveal>
            <p class="eyebrow">LUMIMAX 智能秤</p>
            <h1>把每天称重这件小事，变成持续可见的身体管理。</h1>
            <p class="hero-body">
              从站上秤面的那一刻开始，到 App 中的趋势、记录与目标反馈， LUMIMAX
              让家庭健康管理更轻、更稳，也更容易坚持。
            </p>
            <div class="hero-actions">
              <a class="button button-primary" href="#download">
                <ScanLine :size="18" />
                <span>扫码下载 App</span>
              </a>
              <a class="button button-secondary" href="#experience">
                <Smartphone :size="18" />
                <span>查看 App 体验</span>
              </a>
            </div>
          </div>

          <div class="hero-visual" data-reveal>
            <div class="hero-stage">
              <div class="product-card">
                <img class="product-image" :src="heroImageUrl" alt="LUMIMAX 智能秤" />
              </div>
              <div class="phone-panel">
                <div class="phone-screen">
                  <div class="phone-status">
                    <span>今日记录</span>
                    <span>07:42</span>
                  </div>
                  <div class="metric-block">
                    <div class="metric-label">体重</div>
                    <div class="metric-value">58.6</div>
                    <div class="metric-unit">kg</div>
                  </div>
                  <div class="trend-line" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div class="phone-footer">
                    <span>连续记录 18 天</span>
                    <Sparkles :size="16" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" class="section">
        <div class="content-shell">
          <div class="section-intro" data-reveal>
            <p class="eyebrow">产品亮点</p>
            <h2>更安静的硬件体验，更清晰的数据反馈。</h2>
          </div>
          <div class="feature-grid">
            <article
              v-for="feature in features"
              :key="feature.title"
              class="feature-item"
              data-reveal
            >
              <div class="feature-icon">
                <component :is="feature.icon" :size="22" />
              </div>
              <h3>{{ feature.title }}</h3>
              <p>{{ feature.copy }}</p>
            </article>
          </div>
        </div>
      </section>

      <section id="experience" class="section section-dark">
        <div class="content-shell">
          <div class="experience-layout">
            <div class="experience-copy" data-reveal>
              <p class="eyebrow">App 体验</p>
              <h2>从秤面到手机，一次动作就能完成全链路记录。</h2>
              <div class="workflow-list">
                <article v-for="item in workflow" :key="item.eyebrow" class="workflow-item">
                  <span class="workflow-index">{{ item.eyebrow }}</span>
                  <div>
                    <h3>{{ item.title }}</h3>
                    <p>{{ item.copy }}</p>
                  </div>
                </article>
              </div>
            </div>

            <div class="experience-visual" data-reveal>
              <div class="floating-panel">
                <div class="floating-header">
                  <span>App 下载入口</span>
                  <ArrowRight :size="16" />
                </div>
                <div class="store-summary">
                  <div class="store-pill">
                    <strong>iPhone</strong>
                    <span>App Store 下载</span>
                  </div>
                  <div class="store-pill">
                    <strong>Android</strong>
                    <span>扫码或浏览器打开</span>
                  </div>
                </div>
                <div class="mini-stats">
                  <div>
                    <strong>统一入口</strong>
                    <span>支持家庭成员快速配置</span>
                  </div>
                  <div>
                    <strong>下载方式</strong>
                    <span>点击后再展示二维码</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="download" class="download-band">
        <div class="content-shell download-layout">
          <div class="download-hover-zone" @mouseleave="hideQr">
            <div class="download-copy" data-reveal>
              <p class="eyebrow">立即下载</p>
              <h2>打开手机，扫一下就能开始。</h2>
              <p>
                官方下载入口可同时服务 iPhone 与 Android。后续你只需要替换环境变量里的真实下载链接。
              </p>
              <div class="download-hover-anchor">
                <div v-if="qrVisible" class="qr-panel qr-panel-visible qr-panel-floating">
                  <img
                    v-if="activeQrImage"
                    :src="activeQrImage"
                    :alt="`${activeQrLabel} 下载二维码`"
                  />
                  <div class="qr-caption">
                    <strong>扫码下载 {{ activeQrLabel }} 版 LUMIMAX App</strong>
                    <span>二维码浮层显示在下载按钮上方</span>
                  </div>
                </div>
                <div class="download-actions">
                  <a
                    class="button button-primary"
                    :href="iosDownloadUrl"
                    target="_blank"
                    rel="noreferrer"
                    @mouseenter="showQr('ios')"
                    @focus="showQr('ios')"
                  >
                    <Download :size="18" />
                    <span>iPhone 下载</span>
                  </a>
                  <a
                    class="button button-secondary"
                    :href="androidDownloadUrl"
                    target="_blank"
                    rel="noreferrer"
                    @mouseenter="showQr('android')"
                    @focus="showQr('android')"
                  >
                    <Download :size="18" />
                    <span>Android 下载</span>
                  </a>
                </div>
              </div>
              <p class="download-tip">鼠标移动到下载按钮上，即可查看对应二维码。</p>
            </div>
          </div>
        </div>
      </section>

      <footer class="site-footer">
        <div class="content-shell footer-shell">
          <div class="footer-brand-block">
            <div class="footer-brand">
              <span class="brand-mark">LM</span>
              <div>
                <strong>{{ title }}</strong>
                <p>智能秤与 App 协同的日常健康记录体验。</p>
              </div>
            </div>
            <h3>把日常称重，变成更安静、更长期的健康管理习惯。</h3>
            <p class="footer-lead">
              从家庭场景里的稳定测量，到手机里的连续趋势、阶段目标与下载入口， LUMIMAX
              希望把每一次站上秤面的动作，都变成真正有反馈的日常体验。
            </p>
          </div>
          <div class="footer-columns">
            <div class="footer-column">
              <span class="footer-heading">产品</span>
              <div class="footer-links">
                <a href="#features">产品亮点</a>
                <a href="#experience">App 体验</a>
                <a href="#download">下载入口</a>
              </div>
            </div>
            <div class="footer-column">
              <span class="footer-heading">联系与支持</span>
              <div class="footer-links">
                <a href="mailto:hello@lumimax.ai">商务联系</a>
                <a href="/privacy">隐私政策</a>
                <a href="/terms">用户协议</a>
              </div>
            </div>
          </div>
          <div class="footer-meta">
            <p class="footer-note">© 2026 LUMIMAX. Smart scale, calmer daily tracking.</p>
            <p class="footer-subnote">支持 iPhone / Android 下载，适配家庭健康记录场景。</p>
          </div>
        </div>
      </footer>
    </main>
  </div>
</template>
