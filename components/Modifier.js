const Zlib = require("zlib");
const ByteBuffer = require("bytebuffer");
const EMsg = require("./EMsg.js");
const Protobufs = require("./Protobufs.js");
const JOBID_NONE = "18446744073709551615";
const PROTO_MASK = 0x80000000;

module.exports = class Modifier {
	static async run(header, body, country) {
		// We only care about GameCoordinator messages (Shouldn't matter here as we already check them earlier)
		if (EMsg.ClientFromGC !== header.msg) {
			return false;
		}

		console.log("Received ClientFromGC, handling...");

		// Do some special encoding/decoding here for protobufs
		let gcMsgType = body.msgtype & ~PROTO_MASK;
		let gcTargetJobID;
		let gcBody;
		let gcHeader;

		// We only care about 4004 (CMsgClientWelcome)
		if (gcMsgType !== 4004) {
			return false;
		}

		console.log("Received CMsgClientWelcome");

		if (body.msgtype & PROTO_MASK) {
			// This is a protobuf message
			let gcHeaderLength = body.payload.readInt32LE(4);
			gcHeader = Protobufs.decodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, body.payload.slice(8, 8 + gcHeaderLength));
			gcTargetJobID = gcHeader.job_id_target || JOBID_NONE;
			gcBody = body.payload.slice(8 + gcHeaderLength);
		} else {
			gcHeader = ByteBuffer.wrap(body.payload.slice(0, 18));
			gcTargetJobID = gcHeader.readUint64(2);
			gcBody = body.payload.slice(18);
		}

		try {
			let decoded = Protobufs.decodeProto(Protobufs.Protos.csgo.CMsgClientWelcome, gcBody);
			if (decoded.txn_country_code) {
				decoded.txn_country_code = country.toUpperCase();
				console.log("Modified txn_country_code to " + country.toUpperCase());
			} else {
				console.log("No txn_country_code value");
			}

			let modified = Protobufs.encodeProto(Protobufs.Protos.csgo.CMsgClientWelcome, decoded);
			gcHeader = gcHeader;
			gcBody = modified;
		} catch (err) {
			console.error(err);

			// If something goes wrong return unmodified
			return false;
		}

		// Now we have to encode this again!
		let gcNewHeader;
		if (body.msgtype & PROTO_MASK) {
			let protoHeader = Protobufs.encodeProto(Protobufs.Protos.steam.CMsgProtoBufHeader, gcHeader);
			gcNewHeader = Buffer.alloc(8);
			gcNewHeader.writeUInt32LE(body.msgtype, 0);
			gcNewHeader.writeInt32LE(protoHeader.length, 4);
			gcNewHeader = Buffer.concat([gcNewHeader, protoHeader]);
		} else {
			gcNewHeader = ByteBuffer.allocate(18, ByteBuffer.LITTLE_ENDIAN);
			gcNewHeader.writeUint16(1); // header version
			gcNewHeader.writeUint64(JOBID_NONE);
			gcNewHeader.writeUint64(gcTargetJobID);
			gcNewHeader = gcNewHeader.flip().toBuffer();
		}

		body.payload = Buffer.concat([gcNewHeader, gcBody]);

		// Return the modified header and body
		return {
			header: header,
			body: body
		};
	}

	static async multi(ch, header, body, country) {
		// Decode the multi-packet
		let parts = await decodeMulti(body);

		// Go through the "HandleNetMessage" process again with all normal packets so we can modify them
		let modifiedBufs = await Promise.all(parts.map(p => ch.HandleNetMessage(p, country)));

		return modifiedBufs;
	}
}

function decodeMulti(body) {
	return new Promise(async (resolve, reject) => {
		let parts = [];

		let payload = body.message_body;
		if (body.size_unzipped) {
			let _p = await new Promise((res, rej) => {
				Zlib.gunzip(payload, (err, unzipped) => {
					if (err) {
						// FIXME: Panic
						rej(err);
						return;
					}

					let _parts = processMulti(unzipped);
					res(_parts);
				});
			}).catch(reject);

			if (!_p) {
				return;
			}

			parts = _p;
		} else {
			parts = processMulti(payload);
		}

		function processMulti(payload) {
			let p = [];

			while (payload.length > 0) {
				let subSize = payload.readUInt32LE(0);
				p.push(payload.slice(4, 4 + subSize));
				payload = payload.slice(4 + subSize);
			}

			return p;
		}

		resolve(parts);
	});
}
