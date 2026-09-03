import { weddingContent } from './content.js';

const scenes = [...document.querySelectorAll('.scene')];
const experience = document.getElementById('experience');
const stage = document.querySelector('.stage');
const sceneCurrent = document.getElementById('sceneCurrent');
const scrollHint = document.getElementById('scrollHint');
const musicControl = document.getElementById('musicControl');
const musicLabel = musicControl?.querySelector('.music-label');
const audio = document.getElementById('weddingAudio');

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function applyContent(content) {
  const [coverGroom, coverBride] = document.querySelectorAll('.scene-copy--cover h1 span');
  const [coupleGroom, coupleBride] = document.querySelectorAll('.scene-copy--couple h2 span');
  const coverDate = document.querySelector('.scene-copy--cover .date');
  const monogram = document.querySelector('.monogram');
  const year = document.querySelector('.big-number');
  const dayLine = document.querySelector('.scene-time h2');
  const schedule = document.querySelector('.schedule');
  const venueName = document.querySelector('.scene-copy--location h2');
  const venueAddress = document.querySelector('.scene-copy--location .address');
  const navButton = document.querySelector('.nav-button');
  const invitationCopy = document.querySelector('.invitation-copy');
  const invitationRows = document.querySelectorAll('.invitation-meta dd');
  const signature = document.querySelector('.signature');
  const audioSource = audio?.querySelector('source');

  [coverGroom, coupleGroom].forEach((node) => { if (node) node.textContent = content.couple.groom; });
  [coverBride, coupleBride].forEach((node) => { if (node) node.textContent = content.couple.bride; });
  if (coverDate) coverDate.textContent = content.date.display;
  if (monogram) monogram.textContent = content.couple.monogram;
  if (year) year.textContent = content.date.year;
  if (dayLine) dayLine.textContent = content.date.dayLine;

  if (schedule) {
    schedule.replaceChildren(...content.schedule.map(({ time, label }) => {
      const item = document.createElement('span');
      const strong = document.createElement('b');
      strong.textContent = time;
      item.append(strong, document.createTextNode(label));
      return item;
    }));
  }

  if (venueName) venueName.textContent = content.venue.name;
  if (venueAddress) venueAddress.textContent = content.venue.address;
  if (navButton) {
    navButton.disabled = !content.venue.mapUrl;
    navButton.addEventListener('click', () => {
      if (content.venue.mapUrl) window.open(content.venue.mapUrl, '_blank', 'noopener,noreferrer');
    });
  }

  if (invitationCopy) {
    invitationCopy.replaceChildren(
      document.createTextNode('谨定于 '),
      Object.assign(document.createElement('strong'), { textContent: content.date.formal }),
      document.createTextNode(' 举行婚礼。'),
      document.createElement('br'),
      document.createTextNode(content.invitation.message)
    );
  }

  if (invitationRows.length >= 4) {
    invitationRows[0].textContent = `${content.couple.groom} · ${content.couple.bride}`;
    invitationRows[1].textContent = `${content.date.display.replaceAll(' · ', ' / ')} · ${content.schedule[1]?.time ?? ''}`;
    invitationRows[2].textContent = content.venue.name;
    invitationRows[3].textContent = content.venue.address;
  }
  if (signature) signature.textContent = content.invitation.closing;
  if (audioSource && audio && musicControl && musicLabel) {
    const source = content.music.src?.trim();
    if (source) {
      audioSource.src = source;
      musicControl.disabled = false;
      musicLabel.textContent = '音乐';
      musicControl.setAttribute('aria-label', '播放婚礼配乐');
    } else {
      audioSource.removeAttribute('src');
      musicControl.disabled = true;
      musicLabel.textContent = '待配乐';
      musicControl.setAttribute('aria-label', '尚未配置婚礼配乐');
    }
    audio.load();
  }
}

applyContent(weddingContent);

let framePending = false;
let lastActive = -1;

function getStoryMetrics() {
  const rect = experience.getBoundingClientRect();
  const storyTop = window.scrollY + rect.top;
  const scrollable = Math.max(1, experience.offsetHeight - window.innerHeight);
  const progress = clamp((window.scrollY - storyTop) / scrollable);
  const scenePosition = progress * Math.max(1, scenes.length - 1);
  return { progress, scenePosition };
}

function renderStory() {
  framePending = false;
  const { progress, scenePosition } = getStoryMetrics();
  const activeIndex = Math.round(scenePosition);

  scenes.forEach((scene, index) => {
    const distance = Math.abs(scenePosition - index);
    const visibility = smoothstep(1 - distance);
    const localProgress = smoothstep((scenePosition - index + 1) / 2);
    const isActive = activeIndex === index;

    scene.style.setProperty('--visibility', visibility.toFixed(4));
    scene.style.setProperty('--p', localProgress.toFixed(4));
    scene.classList.toggle('is-interactive', isActive);
    scene.toggleAttribute('inert', !isActive);
    scene.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  stage.style.setProperty('--story-progress', Math.max(.05, progress).toFixed(4));
  scrollHint?.classList.toggle('is-hidden', progress > .08 || progress > .985);

  if (activeIndex !== lastActive) {
    lastActive = activeIndex;
    if (sceneCurrent) sceneCurrent.textContent = String(activeIndex + 1).padStart(2, '0');
  }
}

function requestRender() {
  if (framePending) return;
  framePending = true;
  requestAnimationFrame(renderStory);
}

window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', requestRender, { passive: true });
window.addEventListener('orientationchange', requestRender, { passive: true });

function setMusicState(isPlaying) {
  if (!musicControl || !musicLabel) return;
  musicControl.setAttribute('aria-pressed', String(isPlaying));
  musicControl.setAttribute('aria-label', isPlaying ? '暂停婚礼配乐' : '播放婚礼配乐');
  musicLabel.textContent = isPlaying ? '暂停' : '音乐';
}

musicControl?.addEventListener('click', async () => {
  if (!audio) return;

  if (!audio.paused) {
    audio.pause();
    setMusicState(false);
    return;
  }

  try {
    await audio.play();
    setMusicState(true);
  } catch {
    setMusicState(false);
    musicLabel.textContent = '待配乐';
    musicControl.setAttribute('aria-label', '尚未配置婚礼配乐');
  }
});

audio?.addEventListener('pause', () => setMusicState(false));
audio?.addEventListener('play', () => setMusicState(true));
audio?.addEventListener('error', () => {
  if (!musicLabel || !musicControl) return;
  musicLabel.textContent = '待配乐';
  musicControl.setAttribute('aria-label', '尚未配置婚礼配乐');
});

renderStory();
