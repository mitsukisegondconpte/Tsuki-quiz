// Placeholder logic if needed, but Baileys handles group metadata usually
async function getIdParticipantGroupe(sock, jid) {
    const metadata = await sock.groupMetadata(jid);
    return metadata.participants.map(p => p.id);
}

module.exports = { getIdParticipantGroupe };
