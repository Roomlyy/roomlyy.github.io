import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  "https://erdyjokgrmulwluggnpo.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_XdhdLs6Inom_KfAklu7ucg_jfvgkoo3";

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// -------------------------
// STATE
// -------------------------

let sessionId =
  localStorage.getItem("roomly_session");

if (!sessionId) {
  sessionId =
    crypto.randomUUID();

  localStorage.setItem(
    "roomly_session",
    sessionId
  );
}

let currentRoom = null;
let currentName = null;
let realtimeChannel = null;


// -------------------------
// ELEMENTS
// -------------------------

const homeScreen =
  document.getElementById("home-screen");

const chatScreen =
  document.getElementById("chat-screen");

const nameInput =
  document.getElementById("name-input");

const roomCodeInput =
  document.getElementById("room-code-input");

const createBtn =
  document.getElementById("create-btn");

const joinBtn =
  document.getElementById("join-btn");

const homeError =
  document.getElementById("home-error");

const roomCode =
  document.getElementById("room-code");

const memberCount =
  document.getElementById("member-count");

const membersList =
  document.getElementById("members-list");

const messages =
  document.getElementById("messages");

const messageForm =
  document.getElementById("message-form");

const messageInput =
  document.getElementById("message-input");

const copyBtn =
  document.getElementById("copy-btn");

const leaveBtn =
  document.getElementById("leave-btn");

const toast =
  document.getElementById("toast");


// -------------------------
// HELPERS
// -------------------------

function makeRoomCode() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let result = "";

  for (let i = 0; i < 8; i++) {
    result += chars[
      Math.floor(Math.random() * chars.length)
    ];
  }

  return result.slice(0, 4) +
    "-" +
    result.slice(4);
}


function showError(message) {
  homeError.textContent = message;
}


function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}


function getInitial(name) {
  return name
    .trim()
    .charAt(0)
    .toUpperCase() || "?";
}


// -------------------------
// CREATE ROOM
// -------------------------

createBtn.addEventListener("click", async () => {
  const name =
    nameInput.value.trim();

  if (!name) {
    showError("Enter a display name first.");
    return;
  }

  createBtn.disabled = true;
  showError("");

  try {
    let code;
    let room;

    for (let i = 0; i < 10; i++) {
      code = makeRoomCode();

      const result =
        await supabase
          .from("rooms")
          .insert({
            code,
            owner_id: sessionId
          })
          .select()
          .single();

      if (!result.error) {
        room = result.data;
        break;
      }
    }

    if (!room) {
      throw new Error(
        "Couldn't generate a room."
      );
    }

    await joinRoom(room, name);

  } catch (error) {
    console.error(error);
    showError(
      "Couldn't create the room."
    );
  }

  createBtn.disabled = false;
});


// -------------------------
// JOIN ROOM
// -------------------------

joinBtn.addEventListener("click", async () => {
  const name =
    nameInput.value.trim();

  const code =
    roomCodeInput.value
      .trim()
      .toUpperCase();

  if (!name) {
    showError("Enter a display name first.");
    return;
  }

  if (!code) {
    showError("Enter a room code.");
    return;
  }

  joinBtn.disabled = true;
  showError("");

  try {
    const { data: room, error } =
      await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .maybeSingle();

    if (error) throw error;

    if (!room) {
      throw new Error(
        "Room not found."
      );
    }

    await joinRoom(room, name);

    } catch (error) {
    console.error("JOIN ERROR:", error);

    showError(
      error.message ||
      error.details ||
      "Couldn't join the room."
    );
  }

  joinBtn.disabled = false;
});


// -------------------------
// JOIN ROOM FUNCTION
// -------------------------

async function joinRoom(room, name) {
  const { error } =
    await supabase
      .from("members")
      .upsert({
        room_id: room.id,
        session_id: sessionId,
        display_name: name
      }, {
        onConflict:
          "room_id,session_id"
      });

  if (error) throw error;

  currentRoom = room;
  currentName = name;

  roomCode.textContent =
    room.code;

  homeScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");

  await loadMessages();
  await loadMembers();

  subscribeToRoom();

  messageInput.focus();
}


// -------------------------
// LOAD MESSAGES
// -------------------------

async function loadMessages() {
  const { data, error } =
    await supabase
      .from("messages")
      .select("*")
      .eq("room_id", currentRoom.id)
      .order("created_at", {
        ascending: true
      });

  if (error) {
    console.error(error);
    return;
  }

  messages.innerHTML = "";

  if (!data.length) {
    showEmptyChat();
    return;
  }

  data.forEach(addMessage);

  scrollMessages();
}


// -------------------------
// ADD MESSAGE TO UI
// -------------------------

function addMessage(message) {
  const empty =
    messages.querySelector(
      ".empty-chat"
    );

  if (empty) empty.remove();

  const wrapper =
    document.createElement("div");

  wrapper.className =
    "message" +
    (
      message.session_id === sessionId
        ? " mine"
        : ""
    );

  const name =
    document.createElement("div");

  name.className =
    "message-name";

  name.textContent =
    message.display_name;

  const body =
    document.createElement("div");

  body.className =
    "message-body";

  body.textContent =
    message.content;

  wrapper.appendChild(name);
  wrapper.appendChild(body);

  messages.appendChild(wrapper);

  scrollMessages();
}


function showEmptyChat() {
  messages.innerHTML = `
    <div class="empty-chat">
      <div class="empty-icon">💬</div>
      <h2>Welcome to Roomly</h2>
      <p>Send the first message.</p>
    </div>
  `;
}


function scrollMessages() {
  messages.scrollTop =
    messages.scrollHeight;
}


// -------------------------
// SEND MESSAGE
// -------------------------

messageForm.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const content =
      messageInput.value.trim();

    if (!content || !currentRoom)
      return;

    messageInput.value = "";

    const { error } =
      await supabase
        .from("messages")
        .insert({
          room_id: currentRoom.id,
          session_id: sessionId,
          display_name: currentName,
          content
        });

    if (error) {
      console.error(error);
      showToast(
        "Couldn't send message."
      );
    }
  }
);


// -------------------------
// MEMBERS
// -------------------------

async function loadMembers() {
  const { data, error } =
    await supabase
      .from("members")
      .select("*")
      .eq("room_id", currentRoom.id)
      .order("joined_at");

  if (error) {
    console.error(error);
    return;
  }

  membersList.innerHTML = "";

  data.forEach(member => {
    const item =
      document.createElement("div");

    item.className =
      "member";

    const avatar =
      document.createElement("div");

    avatar.className =
      "avatar";

    avatar.textContent =
      getInitial(member.display_name);

    const info =
      document.createElement("div");

    const name =
      document.createElement("div");

    name.className =
      "member-name";

    name.textContent =
      member.display_name;

    info.appendChild(name);

    if (
      member.session_id ===
      currentRoom.owner_id
    ) {
      const badge =
        document.createElement("div");

      badge.className =
        "owner-badge";

      badge.textContent =
        "Owner";

      info.appendChild(badge);
    }

    item.appendChild(avatar);
    item.appendChild(info);

    membersList.appendChild(item);
  });

  memberCount.textContent =
    `${data.length} member` +
    (data.length === 1 ? "" : "s");
}


// -------------------------
// REALTIME
// -------------------------

function subscribeToRoom() {

  if (realtimeChannel) {
    supabase.removeChannel(
      realtimeChannel
    );
  }

  realtimeChannel =
    supabase
      .channel(
        `room-${currentRoom.id}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter:
            `room_id=eq.${currentRoom.id}`
        },
        payload => {
          addMessage(payload.new);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "members",
          filter:
            `room_id=eq.${currentRoom.id}`
        },
        () => {
          loadMembers();
        }
      )
      .subscribe();
}


// -------------------------
// COPY CODE
// -------------------------

copyBtn.addEventListener(
  "click",
  async () => {

    await navigator.clipboard.writeText(
      currentRoom.code
    );

    showToast(
      "Room code copied!"
    );
  }
);


// -------------------------
// LEAVE
// -------------------------

leaveBtn.addEventListener(
  "click",
  async () => {

    if (!currentRoom)
      return;

    await supabase
      .from("members")
      .delete()
      .eq("room_id", currentRoom.id)
      .eq("session_id", sessionId);

    if (realtimeChannel) {
      await supabase.removeChannel(
        realtimeChannel
      );

      realtimeChannel = null;
    }

    currentRoom = null;
    currentName = null;

    chatScreen.classList.add(
      "hidden"
    );

    homeScreen.classList.remove(
      "hidden"
    );

    roomCodeInput.value = "";

    showToast(
      "You left the room."
    );
  }
);
 
