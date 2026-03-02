// storeTags.js

const chunks = text.match(/(.{1,800})/g) || [];
for (let i = 0; i < chunks.length; i++) {
  const sectionText = chunks[i];
  const tags = detectLlmTags(sectionText);

  await collection.add({
    ids: [`${file.id}_${i}`],
    documents: [sectionText],
    metadatas: [
      {
        source: file.name,
        page: i + 1,
        exam_tags: tags,
      },
    ],
  });
}
