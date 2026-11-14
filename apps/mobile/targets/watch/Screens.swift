import SwiftUI

// MARK: - Idle

struct IdleView: View {
    let state: MatchState
    let onStartLast: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Text("NO LIVE MATCH")
                .font(.system(size: 12, weight: .semibold))
                .tracking(1)
                .foregroundStyle(Court.white.opacity(0.5))

            if let last = state.last {
                HStack(spacing: 6) {
                    ResultBadge(won: last.won)
                    Text(last.line)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Court.white.opacity(0.55))
                        .lineLimit(1)
                }
            }

            Button(action: onStartLast) {
                VStack(spacing: 1) {
                    Text("START MATCH")
                        .font(.system(size: 15, weight: .heavy))
                    if state.last != nil {
                        Text("LAST LINEUP")
                            .font(.system(size: 9, weight: .semibold))
                            .opacity(0.7)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .foregroundStyle(Court.ink)
                .background(Court.accent, in: Capsule())
            }
            .buttonStyle(.plain)

            Text("or set up on phone")
                .font(.system(size: 10))
                .foregroundStyle(Court.white.opacity(0.4))
        }
        .padding(.horizontal, 16)
        .multilineTextAlignment(.center)
    }
}

// MARK: - Live scoring

/// Apple-Workout-style sideways tabs: swipe between the **controls** (undo,
/// pause, stop-and-save, cancel) and the **scoreboard** (tap a team to score).
/// Separating the two keeps the score face uncluttered and makes an accidental
/// stop impossible while you're rapidly tapping points.
struct LiveView: View {
    let state: MatchState
    let liveBpm: Int
    let onScore: (String) -> Void
    let onUndo: () -> Void
    let onSetChoice: (String) -> Void
    let onPause: () -> Void
    let onStop: () -> Void
    let onCancel: () -> Void

    // Land on the scoreboard — the surface you touch every rally; controls are
    // one swipe away.
    @State private var tab = Tab.score

    private enum Tab {
        case controls, score
    }

    var body: some View {
        TabView(selection: $tab) {
            ControlsTab(state: state, onUndo: onUndo, onPause: onPause, onStop: onStop, onCancel: onCancel)
                .tag(Tab.controls)
            ScoreTab(state: state, liveBpm: liveBpm, onScore: onScore, onSetChoice: onSetChoice)
                .tag(Tab.score)
        }
        .tabViewStyle(.page)
    }
}

/// The score face — the only thing on screen is the two tappable team rows,
/// or, during a squash "choice" tie-break, the mandatory SHORT/LONG decision.
private struct ScoreTab: View {
    let state: MatchState
    let liveBpm: Int
    let onScore: (String) -> Void
    let onSetChoice: (String) -> Void

    var body: some View {
        VStack(spacing: 4) {
            header
            // The call that matters right now — game point, set point, deuce — as the
            // phone words it. Hidden while paused and while the choice buttons are up.
            if !state.status.isEmpty && !state.paused && !state.choicePending {
                Text(state.status)
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(0.8)
                    .foregroundStyle(Court.accent)
                    .lineLimit(1)
            }
            if state.choicePending {
                ChoiceButtons(onChoose: onSetChoice)
            } else {
                TeamScoreRow(
                    short: state.teamA.short,
                    point: state.pointA,
                    serving: state.teamA.serving,
                    servingSide: state.teamA.servingSide,
                    color: Court.accent,
                    paused: state.paused,
                    onTap: { onScore("A") }
                )
                Rectangle().fill(Court.white.opacity(0.12)).frame(height: 1)
                TeamScoreRow(
                    short: state.teamB.short,
                    point: state.pointB,
                    serving: state.teamB.serving,
                    servingSide: state.teamB.servingSide,
                    color: Court.teamB,
                    paused: state.paused,
                    onTap: { onScore("B") }
                )
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 2)
    }

    private var header: some View {
        HStack {
            // Live heart rate from the workout session, else the match clock.
            if liveBpm > 0 {
                Text("\(liveBpm)♥")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Court.accent)
            } else {
                matchClock
            }
            Spacer(minLength: 4)
            // Which set/game and the score around it — never the point score again.
            Text([state.setLabel, state.games].filter { !$0.isEmpty }.joined(separator: "  "))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Court.white.opacity(0.75))
                .lineLimit(1)
            Spacer(minLength: 4)
            // Only PAUSED is a status worth showing; a live match needs no label.
            if state.paused {
                Text("PAUSED")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Court.white.opacity(0.5))
            }
        }
    }

    /// Time played, ticking on the watch from the phone's `clockBase` (the phone
    /// only pushes on points); the frozen `clock` string while paused.
    @ViewBuilder
    private var matchClock: some View {
        HStack(spacing: 3) {
            Image(systemName: "stopwatch")
                .font(.system(size: 10, weight: .semibold))
            if let base = state.clockBase, !state.paused {
                Text(Date(timeIntervalSince1970: base / 1000), style: .timer)
            } else {
                Text(state.clock)
            }
        }
        .font(.system(size: 12, weight: .medium).monospacedDigit())
        .foregroundStyle(Court.white.opacity(0.5))
    }
}

/// The actions face — undo, pause/resume, the square stop-and-save, and a
/// guarded full cancel.
private struct ControlsTab: View {
    let state: MatchState
    let onUndo: () -> Void
    let onPause: () -> Void
    let onStop: () -> Void
    let onCancel: () -> Void

    @State private var confirmingCancel = false

    var body: some View {
        VStack(spacing: 9) {
            Text(state.paused ? "PAUSED" : "CONTROLS")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(state.paused ? Court.white.opacity(0.5) : Court.accent)

            HStack(spacing: 18) {
                labeled("UNDO") {
                    CircleIcon(system: "arrow.uturn.backward", tint: Court.white, fill: Court.white.opacity(0.14), action: onUndo)
                        .disabled(state.paused)
                        .opacity(state.paused ? 0.35 : 1)
                }
                labeled(state.paused ? "RESUME" : "PAUSE") {
                    CircleIcon(
                        system: state.paused ? "play.fill" : "pause.fill",
                        tint: Court.ink,
                        fill: Court.accent,
                        diameter: 44,
                        action: onPause
                    )
                }
            }

            // Stop AND save — the square, "court time's up, don't lose the score".
            Button(action: onStop) {
                HStack(spacing: 6) {
                    Image(systemName: "stop.fill").font(.system(size: 13, weight: .bold))
                    Text("STOP & SAVE").font(.system(size: 14, weight: .heavy))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .foregroundStyle(Court.ink)
                .background(Court.accent, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)

            // Full cancel discards the match — guarded so a stray tap can't wipe it.
            Button(action: { confirmingCancel = true }) {
                Text("CANCEL MATCH")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Court.white.opacity(0.55))
            }
            .buttonStyle(.plain)
            .confirmationDialog("Discard this match?", isPresented: $confirmingCancel) {
                Button("Discard", role: .destructive, action: onCancel)
                Button("Keep playing", role: .cancel) {}
            } message: {
                Text("The score will be lost.")
            }
        }
        .padding(.horizontal, 14)
        .multilineTextAlignment(.center)
    }

    private func labeled<Content: View>(
        _ title: String,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(spacing: 3) {
            content()
            Text(title)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Court.white.opacity(0.5))
        }
    }
}

/// A round icon button — compact and legible on the watch (no wrapping text).
private struct CircleIcon: View {
    let system: String
    let tint: Color
    let fill: Color
    var diameter: CGFloat = 36
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: diameter * 0.4, weight: .bold))
                .foregroundStyle(tint)
                .frame(width: diameter, height: diameter)
                .background(fill, in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct TeamScoreRow: View {
    let short: String
    let point: String
    let serving: Bool
    let servingSide: String?
    /// The team's colour — accent for A, Team B's for B, as on the phone.
    let color: Color
    let paused: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                HStack(spacing: 6) {
                    ServingDot(active: serving && !paused, side: servingSide)
                    Text(short)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(color)
                        .lineLimit(1)
                }
                Spacer()
                Text(point)
                    .font(.system(size: 42, weight: .black, design: .rounded).monospacedDigit())
                    .foregroundStyle(Court.white)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(paused)
        .opacity(paused ? 0.35 : 1)
    }
}

/// The squash "choice" tie-break decision — short (play to the target) or
/// long (one extra point). Mandatory: scoring is refused until a choice is
/// staged, so these buttons replace the score rows while pending.
private struct ChoiceButtons: View {
    let onChoose: (String) -> Void

    var body: some View {
        VStack(spacing: 6) {
            Text("SET 1 OR 2?")
                .font(.system(size: 15, weight: .heavy))
                .foregroundStyle(Court.accent)
            Button(action: { onChoose("one") }) {
                choiceLabel("SHORT · SET 1", "next point wins")
            }
            .buttonStyle(.plain)
            Button(action: { onChoose("two") }) {
                choiceLabel("LONG · SET 2", "two more points")
            }
            .buttonStyle(.plain)
        }
    }

    private func choiceLabel(_ title: String, _ detail: String) -> some View {
        VStack(spacing: 1) {
            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Court.ink)
            Text(detail)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Court.ink.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(Court.accent))
    }
}

// MARK: - Match won

struct WonView: View {
    let state: MatchState
    let onEnd: () -> Void

    var body: some View {
        VStack(spacing: 5) {
            Text("MATCH WON")
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(Court.accent)
            Text(state.won?.winnerShort ?? state.teamA.short)
                .font(.system(size: 26, weight: .black))
                .foregroundStyle(Court.white)
                .lineLimit(1)
            Text(state.won?.scoreLine ?? state.games)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(Court.white.opacity(0.55))
                .lineLimit(1)
            Text([state.won?.duration ?? "", "SAVED TO PHONE"].filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Court.white.opacity(0.5))

            Button(action: onEnd) {
                Text("DONE")
                    .font(.system(size: 14, weight: .heavy))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .foregroundStyle(Court.ink)
                    .background(Court.accent, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .padding(.horizontal, 14)
        .multilineTextAlignment(.center)
    }
}

// MARK: - Small shared pieces

private struct ServingDot: View {
    let active: Bool
    var side: String? = nil

    var body: some View {
        ZStack {
            Circle()
                .fill(active ? Court.accent : Color.clear)
                .frame(width: side != nil ? 14 : 8, height: side != nil ? 14 : 8)
            
            if active, let side = side {
                Text(side == "right" ? "R" : "L")
                    .font(.system(size: 8, weight: .black))
                    .foregroundColor(Court.ink)
            }
        }
    }
}

private struct ResultBadge: View {
    let won: Bool

    var body: some View {
        Text(won ? "W" : "L")
            .font(.system(size: 12, weight: .black))
            .foregroundStyle(won ? Court.ink : Court.white)
            .frame(width: 20, height: 20)
            .background(
                won ? Court.accent : Court.white.opacity(0.15),
                in: RoundedRectangle(cornerRadius: 5)
            )
    }
}
