import { kafka } from '@infra/kafka/kafka-client';

export interface PartitionLag {
  partition: number;
  currentOffset: number;
  latestOffset: number;
  lag: number;
}

export interface ConsumerLagReport {
  groupId: string;
  topic: string;
  partitions: PartitionLag[];
  totalLag: number;
}

/**
 * Fetch consumer group offsets and topic partition offsets to compute consumer lag.
 */
export async function getConsumerLag(groupId: string, topic: string): Promise<ConsumerLagReport> {
  const admin = kafka.admin();
  await admin.connect();
  
  try {
    // 1. Fetch group offsets (where the consumer currently is)
    const topicOffsetsFromGroup = await admin.fetchOffsets({ groupId, topics: [topic] });
    const topicGroupData = topicOffsetsFromGroup.find((x) => x.topic === topic);
    const partitionGroupOffsets = topicGroupData ? topicGroupData.partitions : [];

    // 2. Fetch latest topic offsets (end of partition log)
    const topicOffsets = await admin.fetchTopicOffsets(topic);

    // 3. Match and compute lag per partition
    const partitions = topicOffsets.map((topicOffset) => {
      const groupOffset = partitionGroupOffsets.find(
        (go: { partition: number; offset: string }) => go.partition === topicOffset.partition
      );
      
      const currentOffset = groupOffset && groupOffset.offset !== '-1' 
        ? parseInt(groupOffset.offset, 10) 
        : 0;
      
      const latestOffset = parseInt(topicOffset.offset, 10);
      const lag = latestOffset - currentOffset;

      return {
        partition: topicOffset.partition,
        currentOffset,
        latestOffset,
        lag: lag < 0 ? 0 : lag,
      };
    });

    const totalLag = partitions.reduce((sum, p) => sum + p.lag, 0);

    return {
      groupId,
      topic,
      partitions,
      totalLag,
    };
  } finally {
    await admin.disconnect();
  }
}
