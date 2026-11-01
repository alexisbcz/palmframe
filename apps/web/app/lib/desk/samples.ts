import { emptyManuscript, newPart, type Kind, type Manuscript } from "./model"

// One worked example of each kind, written for the Desk. They carry a few
// deliberate faults, so the red pencil has something to say on the first visit.

function novel(): Manuscript {
  const m = emptyManuscript("novel", "The Salt Ledger")
  m.subtitle = "A novel"
  m.author = "A. N. Author"
  m.parts = [
    newPart(
      "The Weighing House",
      [
        "The ledger had been kept in the same hand for forty-one years, and on the morning Ines Varga opened it to the last page she found the hand had changed.",
        "She read the entry twice. *Eleven sacks, received. Eleven sacks, sold.* Her father’s sevens had always carried a bar. These did not.",
        "“Who wrote this?” she asked quietly.",
        "Old Tomás did not look up from the scales. He moved a brass weight from one pan to the other and waited for the needle to stop. It was a very long time before he answered.",
        "“The man who pays me,” he said.",
        "“My father pays you.”",
        "“Your father has been dead since Thursday.”",
        "Outside, the salt carts were coming down from the pans, and the whole town smelled of brine and wet rope. She felt angry. She closed the book and put her hand flat on the cover, the way he used to, as if it might get up and walk.",
        "***",
        "By noon she had counted the sacks herself. There were nine.",
      ].join("\n")
    ),
    newPart(
      "Two Sacks",
      [
        "Nobody in Porto Sal stole salt. It would have been like stealing rain.",
        "So Ines went looking for what the two sacks had paid for, and in order to do that she went to see the one person in town who had never once been wrong about money.",
      ].join("\n")
    ),
  ]
  m.parts[0]!.synopsis =
    "Ines finds the last ledger entry in a stranger's hand."
  m.parts[1]!.synopsis = "She goes to the moneylender."
  m.parts[1]!.status = "idea"
  m.dailyGoal = 500
  return m
}

function poetry(): Manuscript {
  const m = emptyManuscript("poetry", "Low Water")
  m.author = "A. N. Author"
  m.parts = [
    newPart(
      "Harbour Sonnet",
      `The boats lie down at evening in the mud
and wait, the way the old wait, for the tide.
The gulls have read the morning's news of blood
and picked it clean and set the bones aside.

A woman on the sea wall lights a match.
It shows her hand, and then it shows her face.
She has the weather's way of looking back,
and keeps her grief, like rope, in its own place.

I want to tell her what the water said.
I want to say the ebb is not the end.
But o'er the flats the light is going red
and there are things that talk will never mend.

The tide comes in. It lifts them, one by one.
The boats forget. The woman has gone home.`,
      "shakespearean"
    ),
    newPart(
      "Winter Pond",
      `The heron stands alone
Ice has taken the far bank
One leaf holds its breath`,
      "haiku"
    ),
    newPart(
      "Inventory",
      `One kettle, dented. One chair
that still remembers you.

The window, and what it does
to the afternoon.`,
      "free"
    ),
  ]
  return m
}

function screenplay(): Manuscript {
  const m = emptyManuscript("screenplay", "Last Ferry to Ormsund")
  m.author = "A. N. Author"
  m.contact = "agent@example.com"
  m.parts = [
    newPart(
      "",
      `FADE IN:

EXT. ORMSUND HARBOUR - NIGHT

= Mara misses the last ferry on purpose.

Sodium light on black water. The ferry's stern pulls away from the slip, trailing gulls and diesel.

We see MARA HOLT (50s), a coat too good for this town, standing at the chain. She is watching it go. She thinks about the years she spent here.

A ticket in her hand. She lets the wind have it.

JONAS (O.S.)
That was the last one.

MARA
(not turning)
I know what it was.

JONAS (60s), harbour-master's cap, thermos, comes to the chain beside her. Neither looks at the other.

JONAS
Next boat's Monday.

MARA
Then I've got until Monday.

JONAS
For what?

She takes a folded photograph from her coat. Holds it out, without looking.

MARA
You tell me.

The camera pans down to the photograph. CLOSE UP on a boy of about ten, squinting, on this same slip.

Jonas does not take it.

CUT TO:

INT. JONAS'S KITCHEN - LATER

A two-ring stove. A radio giving the shipping forecast to nobody.

Jonas pours coffee into two cups, then, after a moment, pours one back.

MARA (O.S.)
You still set out two.

JONAS
(angrily)
Habit.

Mara stands in the doorway with the photograph. She begins to walk to the table and puts it down between them, face up.

MARA
The truth is, I never knew which of you to ask.

Jonas sits. For the first time in years, he looks old.

JONAS
Then you'd better sit down.

> FADE OUT.`
    ),
  ]
  return m
}

export const sampleFor = (kind: Kind) =>
  kind === "novel" ? novel() : kind === "poetry" ? poetry() : screenplay()
