# Phase 5 — Game Feel, Audio & Effects

## 1. Mục tiêu

Polish toàn bộ gameplay bằng sound, particles, micro animation và visual feedback.

Phase này không thêm complexity gameplay.

Nguyên tắc:

> Feedback phải làm action dễ hiểu hơn, không chỉ để đẹp.

---

# 2. Audio system

Central audio registry.

Groups:

- UI
- Dice
- Movement
- Money
- Property
- Build
- Card
- Jail
- Bankruptcy
- Victory
- Emote
- Ambience
- Music

Không import/play file rải rác trong component.

---

# 3. Volume controls

Settings:

- Master
- Music
- SFX

Optional:

- mute when unfocused
- ambience

Persist settings.

---

# 4. Audio priorities

Core SFX:

1. button click
2. dice shake
3. dice impact
4. tile hop
5. money receive/pay
6. purchase confirm
7. build pop
8. card flip
9. jail clang
10. bankruptcy
11. victory

Không để nhiều sound cùng lúc gây chói.

---

# 5. Particles

Dùng tiết chế.

Reusable effects:

- sparkle
- dust
- coin burst
- tile pulse
- impact ring
- confetti

Particle count phải có budget.

---

# 6. Floating text

Support:

- `+$200`
- `-$450`
- `RENT`
- `DOUBLE`
- `JAIL`
- `BANKRUPT`

Không spam.

Phải fade nhanh và không che board.

---

# 7. Tile feedback

Reusable tile states:

- hover
- selected
- active
- landed
- purchase
- build
- danger/high-rent optional

Không dùng flashing mạnh.

---

# 8. Reaction / Emote system

V1 emotes:

- laugh
- cry
- angry
- cool
- heart
- skull

Presentation:

- emoji bubble trên character
- short bounce
- auto dismiss

Rate limit client/server phù hợp để tránh spam.

---

# 9. Event Feed

Compact event feed:

- player rolled
- bought property
- paid rent
- built
- drew card
- entered jail
- bankrupt

Feed hỗ trợ reconnect context.

Không cần full chat system.

---

# 10. Music & ambience

Music:

- low intensity
- loopable
- không gây mệt sau 30–60 phút

Ambience:

- optional
- rất nhẹ

Music không được lấn dice/action SFX.

---

# 11. Victory / End-game

End screen:

- winner
- character
- player color
- net worth / summary
- key stats
- replay/new room actions

Effects:

- confetti
- victory sound
- mascot bounce
- subtle board celebration

Camera vẫn gần như fixed.

---

# 12. Visual polish

Review:

- spacing
- hierarchy
- font sizes
- HUD readability
- tile readability
- button states
- disabled states
- modal placement
- overlay opacity
- contrast

---

# 13. Testing

Manual focus:

- 30–60 minute session
- audio fatigue
- particle overload
- event feed readability
- HUD clarity
- multi-action sequences
- 4-player board clutter
- reduced motion
- mute/music settings

---

# 14. Acceptance Criteria

- [ ] SFX registry centralized.
- [ ] Master/Music/SFX controls hoạt động.
- [ ] Dice/movement/money/build/card/jail SFX có đủ.
- [ ] Particles không gây clutter.
- [ ] Floating money dễ đọc.
- [ ] Emotes hoạt động.
- [ ] Event feed hoạt động.
- [ ] Victory screen hoàn thiện.
- [ ] 30–60 phút chơi không gây quá tải visual/audio.
- [ ] Reduced motion vẫn chơi được đầy đủ.
- [ ] Performance không regression đáng kể.
- [ ] Typecheck/lint/tests pass.

---

# 15. Không làm ở Phase 5

- voice chat
- complex animated cutscenes
- character voice acting
- huge particle systems
- cinematic camera system
