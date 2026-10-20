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

/*==================== PROJECTS DECK ====================*/
const deck = document.getElementById('project-deck')
const cards = [...deck.querySelectorAll('.project')]
const prevButton = document.getElementById('project-prev')
const nextButton = document.getElementById('project-next')
const dotsContainer = document.getElementById('project-dots')
const flyDuration = reduceMotion.matches ? 0 : 450
let current = 0
let busy = false

const dots = cards.map((_, i) => {
    const dot = document.createElement('button')
    dot.type = 'button'
    dot.className = 'carousel_dot'
    dot.setAttribute('aria-label', `Show project ${i + 1} of ${cards.length}`)
    dot.addEventListener('click', () => {
        if (busy) return
        current = i
        layoutDeck()
    })
    return dot
})
dotsContainer.replaceChildren(...dots)

// Each card's place in the stack: 0 is the front, 1-2 peek out behind it, the rest wait hidden at the back
function layoutDeck() {
    cards.forEach((card, i) => {
        const depth = (i - current + cards.length) % cards.length
        card.style.setProperty('--depth', Math.min(depth, 3))
        card.style.setProperty('--tilt', depth === 0 ? 0 : depth % 2 ? 1 : -1)
        card.style.zIndex = cards.length - depth
        card.classList.toggle('is-front', depth === 0)
        card.classList.toggle('is-hidden', depth > 2)
        card.inert = depth !== 0
    })
    dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === current)
        dot.setAttribute('aria-current', i === current)
    })
}

// Throw the front card off to one side, then tuck it in at the back of the deck
function nextCard(direction = -1) {
    if (busy) return
    busy = true
    const card = cards[current]
    current = (current + 1) % cards.length
    layoutDeck()

    card.style.zIndex = cards.length + 1
    card.style.transition = `transform ${flyDuration}ms var(--ease), opacity ${flyDuration}ms var(--ease)`
    card.style.transform = `translateX(${direction * 130}%) rotate(${direction * 16}deg)`
    card.style.opacity = '0'

    setTimeout(() => {
        card.style.transition = 'none'
        card.style.transform = ''
        card.style.opacity = ''
        layoutDeck()
        card.offsetHeight // commit the jump to the back before transitions return
        card.style.transition = ''
        busy = false
    }, flyDuration)
}

// Bring the previous card back in from the side onto the front of the deck
function previousCard() {
    if (busy) return
    busy = true
    current = (current - 1 + cards.length) % cards.length
    const card = cards[current]

    card.style.transition = 'none'
    card.style.transform = 'translateX(-130%) rotate(-16deg)'
    card.style.opacity = '0'
    layoutDeck()
    card.offsetHeight // start from off to the side
    card.style.transition = ''
    card.style.transform = ''
    card.style.opacity = ''

    setTimeout(() => { busy = false }, flyDuration)
}

prevButton.addEventListener('click', previousCard)
nextButton.addEventListener('click', () => nextCard(-1))

deck.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); nextCard(-1) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); previousCard() }
})

// Drag the front card; let go far enough to the side and it flies off
let drag = null
let suppressClick = false

deck.addEventListener('pointerdown', e => {
    const card = cards[current]
    if (busy || e.button !== 0 || !card.contains(e.target)) return
    drag = { card, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, active: false }
})

window.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.active) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        // Mostly vertical movement is a page scroll, not a swipe
        if (Math.abs(dy) > Math.abs(dx)) { drag = null; return }
        drag.active = true
        deck.classList.add('is-dragging')
        drag.card.style.transition = 'none'
    }
    drag.dx = dx
    drag.card.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`
    deck.style.setProperty('--pull', Math.min(Math.abs(dx) / 200, 1))
})

function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return
    const { card, dx, active } = drag
    drag = null
    if (!active) return

    deck.classList.remove('is-dragging')
    deck.style.setProperty('--pull', 0)
    card.style.transition = ''
    // A drag that ends over a link shouldn't also open it
    suppressClick = true
    setTimeout(() => { suppressClick = false })

    if (Math.abs(dx) > 100) nextCard(Math.sign(dx))
    else card.style.transform = ''
}

window.addEventListener('pointerup', endDrag)
window.addEventListener('pointercancel', endDrag)
deck.addEventListener('dragstart', e => e.preventDefault())
deck.addEventListener('click', e => {
    if (!suppressClick) return
    e.preventDefault()
    e.stopPropagation()
}, true)

layoutDeck()

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
