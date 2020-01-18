define(["./Library"], function() {

	function CompoundWord(i) {

		var words = new Array(i);

		var index = i;

		this.get = function() {

			return words[index];
		};

		this.set = function(word, routeIndex, callback) {

			words[index].set(word, routeIndex, callback);
		};

		this.push = function(word) {

			words.push(word);
		};

		this.hasIndex = function(index) {

			return words[index];
		};

		this.setIndex = function(i) {

			index = i;
		};
	}

	return CompoundWord;
});
