const root = document.documentElement
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

/*==================== THEME TOGGLE ====================*/
const themeToggle = document.getElementById('theme-toggle')
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function currentTheme() {
    return root.dataset.theme || (systemDark.matches ? 'dark' : 'light')
}

themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch (e) {}
})

/*==================== REFRACTION (Chromium supports SVG filters in backdrop-filter) ====================*/
const isChromium = !!(navigator.userAgentData && navigator.userAgentData.brands.some(b => b.brand === 'Chromium'))
if (isChromium && !reduceMotion.matches) root.classList.add('has-refraction')

/*==================== DOCK: MOVING LENS + ACTIVE SECTION ====================*/
const dock = document.getElementById('dock')
const lens = document.getElementById('dock-lens')
const dockLinks = [...dock.querySelectorAll('.dock_link')]
let activeLink = dockLinks[0]

function placeLens(link, animate = true) {
    if (!link) return
    if (animate) {
        lens.classList.add('is-moving')
        clearTimeout(placeLens.timer)
        placeLens.timer = setTimeout(() => lens.classList.remove('is-moving'), 260)
    }
    dock.style.setProperty('--lens-x', `${link.offsetLeft}px`)
    dock.style.setProperty('--lens-w', `${link.offsetWidth}px`)
}

function setActive(link) {
    if (link === activeLink) return
    activeLink.classList.remove('is-active')
    activeLink.removeAttribute('aria-current')
    link.classList.add('is-active')
    link.setAttribute('aria-current', 'true')
    activeLink = link
    placeLens(link)
}

// Position the lens without animating it on first paint and when the layout changes
lens.style.transition = 'none'
placeLens(activeLink, false)
requestAnimationFrame(() => requestAnimationFrame(() => { lens.style.transition = '' }))
window.addEventListener('resize', () => placeLens(activeLink, false))
document.fonts && document.fonts.ready.then(() => placeLens(activeLink, false))

const sections = dockLinks.map(link => document.getElementById(link.dataset.section))

function scrollSpy() {
    // The active section is the last one whose top has passed 40% of the viewport
    const marker = window.innerHeight * 0.4
    let current = sections[0]
    sections.forEach(section => {
        if (section.getBoundingClientRect().top <= marker) current = section
    })
    // At the very bottom, the last section wins even if it is short
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = sections[sections.length - 1]
    }
    setActive(dockLinks[sections.indexOf(current)])
}

/*==================== SCROLL UP BUTTON ====================*/
const scrollUpButton = document.getElementById('scroll-up')

function toggleScrollUp() {
    scrollUpButton.classList.toggle('is-visible', window.scrollY >= 560)
}

let scrollTicking = false
window.addEventListener('scroll', () => {
    if (scrollTicking) return
    scrollTicking = true
    requestAnimationFrame(() => {
        scrollSpy()
        toggleScrollUp()
        updateTimeline()
        scrollTicking = false
    })
}, { passive: true })
scrollSpy()
toggleScrollUp()

/*==================== QUALIFICATION SEGMENTED CONTROL ====================*/
const segmented = document.getElementById('qualification-tabs')
const tabs = [...segmented.querySelectorAll('[role="tab"]')]
const segmentThumb = segmented.querySelector('.segmented_thumb')

function selectTab(index) {
    tabs.forEach((tab, i) => {
        const selected = i === index
        const panel = document.getElementById(tab.getAttribute('aria-controls'))
        tab.classList.toggle('is-active', selected)
        tab.setAttribute('aria-selected', selected)
        tab.tabIndex = selected ? 0 : -1
        panel.hidden = !selected
        panel.classList.toggle('is-active', selected)
    })
    segmented.dataset.active = index
    segmentThumb.classList.add('is-moving')
    setTimeout(() => segmentThumb.classList.remove('is-moving'), 260)

    // Measure the new panel now, and again once its cards finish rising into place
    updateTimeline()
    setTimeout(updateTimeline, 1000)
}

tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(i))
    tab.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        selectTab(next)
        tabs[next].focus()
    })
})

/*==================== TIMELINE PROGRESS ====================*/
const timelines = [...document.querySelectorAll('.timeline')]

timelines.forEach(timeline => {
    timeline.querySelectorAll('.timeline_item').forEach(item => {
        const node = document.createElement('span')
        node.className = 'timeline_node'
        node.setAttribute('aria-hidden', 'true')
        item.prepend(node)
    })
})

function updateTimeline() {
    const timeline = timelines.find(t => !t.hidden)
    const nodes = [...timeline.querySelectorAll('.timeline_node')]
    const top = timeline.getBoundingClientRect().top
    const centers = nodes.map(node => {
        const rect = node.getBoundingClientRect()
        return rect.top + rect.height / 2
    })
    const first = centers[0]
    const last = centers[centers.length - 1]

    // The rail spans exactly from the first node to the last
    timeline.style.setProperty('--rail-top', `${first - top}px`)
    timeline.style.setProperty('--rail-height', `${last - first}px`)

    // It fills up to a line 60% down the viewport, lighting every node it passes
    const marker = window.innerHeight * 0.6
    const progress = last > first ? (marker - first) / (last - first) : 0
    timeline.style.setProperty('--progress', Math.min(Math.max(progress, 0), 1))
    nodes.forEach((node, i) => node.parentElement.classList.toggle('is-reached', centers[i] <= marker))
}

window.addEventListener('resize', updateTimeline)
updateTimeline()
setTimeout(updateTimeline, 1000)

/*==================== PROJECTS CAROUSEL ====================*/
const track = document.getElementById('project-track')
const projects = [...track.querySelectorAll('.project')]
const prevButton = document.getElementById('project-prev')
const nextButton = document.getElementById('project-next')
const dotsContainer = document.getElementById('project-dots')
let stops = []
let dots = []

// Scroll positions the track can actually reach. When several cards fit on screen,
// the last few share the final position, so there are fewer stops than projects.
function computeStops() {
    const padding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0
    const maxScroll = track.scrollWidth - track.clientWidth
    stops = []
    projects.forEach(project => {
        const stop = Math.min(Math.max(project.offsetLeft - padding, 0), maxScroll)
        if (!stops.length || stop - stops[stops.length - 1] > 8) stops.push(stop)
    })

    dotsContainer.replaceChildren(...stops.map((_, i) => {
        const dot = document.createElement('button')
        dot.type = 'button'
        dot.className = 'carousel_dot'
        dot.setAttribute('aria-label', `Go to position ${i + 1} of ${stops.length}`)
        dot.addEventListener('click', () => goToStop(i))
        return dot
    }))
    dots = [...dotsContainer.children]
    updateCarousel()
}

function currentStop() {
    let closest = 0
    stops.forEach((stop, i) => {
        if (Math.abs(stop - track.scrollLeft) < Math.abs(stops[closest] - track.scrollLeft)) closest = i
    })
    return closest
}

function updateCarousel() {
    const index = currentStop()
    dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index)
        dot.setAttribute('aria-current', i === index)
    })
    prevButton.disabled = index === 0
    nextButton.disabled = index === stops.length - 1
}

function goToStop(index) {
    const target = stops[Math.max(0, Math.min(stops.length - 1, index))]
    track.scrollTo({ left: target, behavior: reduceMotion.matches ? 'auto' : 'smooth' })
}

prevButton.addEventListener('click', () => goToStop(currentStop() - 1))
nextButton.addEventListener('click', () => goToStop(currentStop() + 1))

track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goToStop(currentStop() + 1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goToStop(currentStop() - 1) }
})

let trackTicking = false
track.addEventListener('scroll', () => {
    if (trackTicking) return
    trackTicking = true
    requestAnimationFrame(() => { updateCarousel(); trackTicking = false })
}, { passive: true })
window.addEventListener('resize', computeStops)
computeStops()

/*==================== REVEAL ON SCROLL ====================*/
const revealItems = document.querySelectorAll('.reveal')

if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return
            entry.target.classList.add('is-visible')
            revealObserver.unobserve(entry.target)
        })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    revealItems.forEach(item => revealObserver.observe(item))
} else {
    revealItems.forEach(item => item.classList.add('is-visible'))
}

/*==================== POINTER SHEEN ON GLASS ====================*/
if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', e => {
        const glass = e.target.closest && e.target.closest('.glass')
        if (!glass) return
        const rect = glass.getBoundingClientRect()
        glass.style.setProperty('--mx', `${e.clientX - rect.left}px`)
        glass.style.setProperty('--my', `${e.clientY - rect.top}px`)
    }, { passive: true })
}

/*==================== FOOTER YEAR ====================*/
document.getElementById('year').textContent = new Date().getFullYear()
